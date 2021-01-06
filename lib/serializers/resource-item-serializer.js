'use strict'

const itemFieldMapper = require('./../field-mapper')('item')
const bibFieldMapper = require('./../field-mapper')('bib')
const log = require('loglevel')
const EsSerializer = require('./es-serializer')

class ResourceItemSerializer extends EsSerializer {
  serialize () {
    const fieldMapping = itemFieldMapper
    // If Item is suppressed, fail serialization
    var suppressed = this.object.literal(fieldMapping.predicateFor('Suppressed')) === 'true'
    if (suppressed) {
      log.info('Refusing to serialize suppressed ' + this.object.uri)
      return null
    }

    this.statements['uri'] = this.object.uri

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

    // Add call number components
    ; [ 'Physical Location', 'Enumeration Chronology' ].forEach((name) => {
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

    var requestablePred = fieldMapping.predicateFor('Requestable')
    if (this.object.has(requestablePred)) {
      this.object.each(requestablePred, (triple) => {
        this.addStatement('requestable', triple.object_literal === 'true')
      })
    }

    var accessMessagePred = fieldMapping.predicateFor('Access message')
    if (this.object.has(accessMessagePred)) {
      this.object.each(accessMessagePred, (triple) => {
        this.addStatement('accessMessage', triple.object_id, triple.object_label)
      })
    }

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

ResourceItemSerializer.serialize = (item) => (new ResourceItemSerializer(item)).serialize()

module.exports = ResourceItemSerializer
