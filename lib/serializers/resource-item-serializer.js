'use strict'

const itemFieldMapper = require('./../field-mapper')('item')
const bibFieldMapper = require('./../field-mapper')('bib')
const log = require('loglevel')
const EsSerializer = require('./es-serializer')
const PlatformApiClient = require('../platform-api-client')

const AEON_REQUESTABLE_LOCATIONS = process.env.AEON_REQUESTABLE_LOCATIONS ? process.env.AEON_REQUESTABLE_LOCATIONS.split(',') : ['scdd1', 'scdd2']
let AEON_REQUESTABLE_SHELFMARK_REGEX = /^Sc (Rare|Scores).*/
if (process.env.AEON_REQUESTABLE_SHELFMARK_REGEX) {
  try {
    AEON_REQUESTABLE_SHELFMARK_REGEX = new RegExp(process.env.AEON_REQUESTABLE_SHELFMARK_REGEX)
  } catch (e) {
    log.error('Failed to parse AEON_REQUESTABLE_SHELFMARK_REGEX as regex: ' + e)
  }
}
const AEON_BASE_URLS = process.env.AEON_BASE_URLS ? process.env.AEON_BASE_URLS.split(',') : ['https://specialcollections.nypl.org']

class ResourceItemSerializer extends EsSerializer {
  serialize (options) {
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

    // Add call number components and recap customer code
    ; [ 'Physical Location', 'Enumeration Chronology', 'ReCAP Customer Code' ].forEach((name) => {
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

    // Establish whether item shelf mark matches aeon pattern:
    const matchesShelfMark = Array.isArray(this.statements['shelfMark']) &&
      this.statements['shelfMark'].some((shelfMark) => AEON_REQUESTABLE_SHELFMARK_REGEX.test(shelfMark))
    // Establish whether item location is an Aeon location:
    const matchesLocation = Array.isArray(this.statements['holdingLocation']) &&
      this.statements['holdingLocation']
        .map((loc) => loc.id)
        .map((loc) => loc.replace(/^loc:/, ''))
        .some((loc) => AEON_REQUESTABLE_LOCATIONS.includes(loc))

    if (matchesShelfMark && matchesLocation) {
      return this.addAeonUrl(options.bib)
    } else {
      return this.statements
    }
  }

  addAeonUrl (bib) {
    const bibid = bib.uri.replace(/^b/, '')

    // Fetch bib
    return PlatformApiClient.instance()
      .then((client) => {
        return client.get(`bibs/sierra-nypl/${bibid}`)
          .then((bib) => {
            // Identify all 856 varfields:
            const var856s = (bib.data.varFields || [])
              .filter((varField) => varField.marcTag === '856')
            if (!var856s) return this.statements

            // Identify the Aeon 856 varfield:
            const aeon856 = var856s
              .filter((var856) => {
                return (var856.subfields || []).some((subfields) => {
                  return subfields.tag === 'u' &&
                    AEON_BASE_URLS.some((baseUrl) => subfields.content.startsWith(baseUrl))
                })
              })

            // If no Aeon 856 found, return early:
            if (aeon856.length === 0) return this.statements

            // Extract Aeon URL:
            let aeonUrl = aeon856[0].subfields
              .filter((subfield) => subfield.tag === 'u')[0].content

            // Add aeonUrl as a statement:
            this.statements['aeonUrl'] = [ aeonUrl ]

            return this.statements
          })
      })
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
