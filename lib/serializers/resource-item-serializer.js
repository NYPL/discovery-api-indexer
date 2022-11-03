'use strict'

const itemFieldMapper = require('./../field-mapper')('item')
const bibFieldMapper = require('./../field-mapper')('bib')
const log = require('loglevel')
const EsSerializer = require('./es-serializer')
const utils = require('../utils')

class ResourceItemSerializer extends EsSerializer {
  serialize (options) {
    const fieldMapping = itemFieldMapper
    // If Item is suppressed, fail serialization
    const suppressed = this.object.literal(fieldMapping.predicateFor('Suppressed')) === 'true'
    if (suppressed) {
      log.info('Refusing to serialize suppressed ' + this.object.uri)
      return null
    }

    this.statements.uri = this.object.uri

    // Add entities:
    ; [
      'Availability',
      'Content owner',
      'Catalog item type',
      'Holding location'
    ].forEach((name) => {
      itemFieldMapper.getMapping(name, (spec) => {
        this.object.each(spec.pred, (triple) => {
          this.addStatement(spec.jsonLdKey, triple.object_id, triple.object_label)
        })
      })
    })

    itemFieldMapper.getMapping('Call number', (spec) => {
      this.object.each(spec.pred, (triple) => {
        this.addStatement(spec.jsonLdKey, triple.object_literal)

        this.addStatement('identifierV2', { value: triple.object_literal, type: 'bf:ShelfMark' })
      })
    })

    // Add straight-forwardly mapped literal statements:
    ; [
      'Date Raw',
      'Enumeration Chronology',
      'Physical Location',
      'ReCAP Customer Code',
      'Volume Raw'
    ].forEach((name) => {
      itemFieldMapper.getMapping(name, (spec) => {
        this.object.each(spec.pred, (triple) => {
          this.addStatement(spec.jsonLdKey, triple.object_literal)
        })
      })
    })

    // Add identifiers
    const identifierPred = fieldMapping.predicateFor('Identifier')
    const identifierValues = this.object.statements(identifierPred)
      .map(parseIdentifierFromStatement)

    // Index identifier entity to 'identifierV2':
    identifierValues.forEach((identifier) => {
      this.addStatement('identifier', identifier.urnStyle)

      if (identifier.entityStyle) {
        this.addStatement('identifierV2', identifier.entityStyle)

        // Add special json-ld key based on type:
        switch (identifier.entityStyle.type) {
          case 'bf:Barcode':
            this.addStatement('idBarcode', identifier.entityStyle.value)
            break
        }
      }
    })

    // Note this comes from bib mapping because that's where it's extracted from:
    bibFieldMapper.getMapping('Electronic location', (spec) => {
      this.object.each(spec.pred, (triple) => {
        this.addStatement(spec.jsonLdKey, { url: triple.object_literal, label: triple.object_label })
      })
      // TODO This is a temporary hack to fix fact most resources encoded using this incorrect pred:
      // Remove this once statements remapped to 'bf:electronicLocator'
      this.object.each('nypl:electronicLocator', (triple) => {
        this.addStatement(spec.jsonLdKey, { url: triple.object_literal, label: triple.object_label })
      })
    })

    const requestablePred = fieldMapping.predicateFor('Requestable')
    if (this.object.has(requestablePred)) {
      this.object.each(requestablePred, (triple) => {
        this.addStatement('requestable', triple.object_literal === 'true')
      })
    }

    const accessMessagePred = fieldMapping.predicateFor('Access message')
    if (this.object.has(accessMessagePred)) {
      this.object.each(accessMessagePred, (triple) => {
        this.addStatement('accessMessage', triple.object_id, triple.object_label)
      })
    }

    // If item has an Aeon-eligible flag and bib has the Aeon base URL..
    const aeonSiteCodePredicate = itemFieldMapper.predicateFor('Aeon Site Code')
    const aeonUrlPredicate = bibFieldMapper.predicateFor('Aeon URL')
    if (this.object.has(aeonSiteCodePredicate) && options.bib.has(aeonUrlPredicate)) {
      // Construct item Aeon URL with site-code replacement:
      const aeonUrl = options.bib.literal(aeonUrlPredicate)
        .replace(/Site=[^&]+/, 'Site=' + this.object.literal(aeonSiteCodePredicate))
      this.statements.aeonUrl = [aeonUrl]
    }

    // Add dueDate:
    const dueDateMapping = itemFieldMapper.getMapping('Due date')
    if (this.object.has(dueDateMapping.pred)) {
      const dueDate = this.object.literal(dueDateMapping.pred)
      this.statements[dueDateMapping.jsonLdKey] = [dueDate]
    }

    // Add range fields:
    ; ['Volume Range', 'Date Range'].forEach((name) => {
      itemFieldMapper.getMapping(name, (spec) => {
        this.object.each(spec.pred, (triple) => {
          const range = triple.object_literal
          // Make sure it has some values in it:
          if (utils.isArrayWithValues(range, 1)) {
            this.addStatement(spec.jsonLdKey, utils.arrayToEsRangeObject(range))
          }
        })
      })
    })

    // Build enumerationChronology_sort using lowest volume and date:
    let lowestVol = null
    const volumeRangeMapping = itemFieldMapper.getMapping('Volume Range')
    if (this.object.has(volumeRangeMapping.pred)) {
      lowestVol = this.object.literals(volumeRangeMapping.pred)
        .sort((r1, r2) => r1[0] < r2[0] ? -1 : 1)
        .shift()[0]
    }
    let lowestDate = null
    const dateRangeMapping = itemFieldMapper.getMapping('Date Range')
    if (this.object.has(dateRangeMapping.pred)) {
      lowestDate = this.object.literals(dateRangeMapping.pred)
        .map((range) => range[0])
        .sort()
        .shift()
    }
    if (lowestVol || lowestDate) {
      // Build enumerationChronology_sort as the lowest vol number (left-
      // padded) followed by the lowest date
      const enumerationChronologySort = [
        utils.leftPad(lowestVol, 10, ' '),
        lowestDate
      ].join('-')
      this.addStatement('enumerationChronology_sort', enumerationChronologySort)
    }

    // Add item.type:
    itemFieldMapper.getMapping('Type', (spec) => {
      this.addStatement(spec.jsonLdKey, this.object.objectId(spec.pred))
    })

    itemFieldMapper.getMapping('Format literal', (spec) => {
      let formatLiteral = null

      const itemType = this.object.objectId(itemFieldMapper.predicateFor('Type'))
      if (itemType === 'bf:Item') {
        // Add bib's resource type (aka material type) as the item's
        // formatLiteral. For serials, this formatLiteral will co-mingle
        // with holding.format values (e.g. Print, Microfilm, Book set)
        const bibResourceType = options.bib
          .statement(bibFieldMapper.predicateFor('Resource type'))
        if (bibResourceType && bibResourceType.object_label) {
          formatLiteral = bibResourceType.object_label
        }
      } else {
        // Likely a nypl:CheckinCardItem with a formatLiteral established
        // upstream
        formatLiteral = this.object.literal(spec.pred)
      }
      if (formatLiteral) {
        this.addStatement(spec.jsonLdKey, formatLiteral)
      }
    })

    return this.statements
  }
}

/**
 * Given a dcterms:identifier statement record, returns a plainobject
 * containing:
 *   entityStyle: a plainobject with `type` and `value` properties
 *                suitable for indexing in identifierV2
 *   urnStyle:    a string built using legacy "urn:[prefix]:[value]"
 *
 * TODO This is mostly temporary to ease transition to entity style
 */
function parseIdentifierFromStatement (statement) {
  const urnPrefixMap = {
    barcode: 'bf:Barcode',
    bnum: 'nypl:Bnumber',
    isbn: 'bf:Isbn',
    issn: 'bf:Issn',
    lccn: 'bf:Lccn',
    oclc: 'nypl:Oclc'
  }

  // These are the three things we want to extract from identifiers in various
  // forms:
  let type = null
  let value = null
  let identifierStatus = null

  // Is statement a blanknode?
  if (statement._statements) {
    type = statement.objectId('rdf:type')
    value = statement.literal('rdf:value')
    identifierStatus = statement.literal('bf:identifierStatus')

  // Otherwise treat statement as a single statmeent (with type packed into
  // value as a prefix or stored in object_type)
  } else {
    type = statement.object_type
    if (!type && /^urn:\w+:/.test(statement.object_id)) {
      type = urnPrefixMap[statement.object_id.split(':')[1]]
    }
    value = statement.object_id.replace(/^urn:\w+:/, '')
  }

  let urnStyle = statement.object_id
  // Create urn style:
  if (type && !/^urn:\w+:/.test(urnStyle)) {
    // Derive prefix from object_type:
    const prefix = Object.keys(urnPrefixMap)
      .filter((prefix) => urnPrefixMap[prefix] === type)
      .pop()
    urnStyle = `urn:${prefix}:${value}`
  }

  const ret = {
    urnStyle
  }
  if (type) {
    ret.entityStyle = {
      type,
      value
    }
    if (identifierStatus) ret.entityStyle.identifierStatus = identifierStatus
  }
  return ret
}

ResourceItemSerializer.serialize = (item, bib) => (new ResourceItemSerializer(item)).serialize({ bib })

module.exports = ResourceItemSerializer
