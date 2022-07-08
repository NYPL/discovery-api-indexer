'use strict'
const utils = require('./../utils')

const bibFieldMapper = require('./../field-mapper')('bib')
const EsSerializer = require('./es-serializer')
const ResourceItemSerializer = require('./resource-item-serializer')
const ResourceHoldingSerializer = require('./resource-holding-serializer')
const NyplSourceMapper = require('discovery-store-models/lib/nypl-source-mapper')

class ResourceSerializer extends EsSerializer {
  serialize () {
    const fieldMapping = bibFieldMapper

    this.statements.uri = this.object.uri

    // Set nyplSource based on uri prefix:
    const { nyplSource } = NyplSourceMapper.instance().splitIdentifier(this.object.uri)
    this.addStatement('nyplSource', nyplSource)

    // If Bib is suppressed, fail serialization
    var suppressed = this.object.literal(fieldMapping.predicateFor('Suppressed')) === 'true'
    if (suppressed) {
      this.addStatement('suppressed', true)
      return this.statements
    }

    this.addStatement('uris', this.object.uri)

    this.addStatement('type', 'nypl:Item')

    var titleSpec = fieldMapping.getMapping('Title')
    if (this.object.has(titleSpec.pred)) {
      var title = this.object.statement(titleSpec.pred).object_literal
      if (title) this.addStatement('title_sort', utils.titleSortTransform(title.substring(0, 80)))
    }

    if (this.object.has(fieldMapping.predicateFor('Contributor literal'))) {
      this.object.each(fieldMapping.predicateFor('Contributor literal'), (triple) => {
        this.addStatement('contributorLiteral', triple.object_literal)
      })
      var contributor = this.object.statement(fieldMapping.predicateFor('Contributor literal')).object_literal
      if (contributor) this.addStatement('contributor_sort', contributor.substring(0, 80).toLowerCase())
    }

    if (this.object.has(fieldMapping.predicateFor('Creator literal'))) {
      this.object.each(fieldMapping.predicateFor('Creator literal'), (triple) => {
        this.addStatement('creatorLiteral', triple.object_literal)
      })
      var creator = this.object.statement(fieldMapping.predicateFor('Creator literal')).object_literal
      if (creator) this.addStatement('creator_sort', creator.substring(0, 80).toLowerCase())
    }

    if (this.object.has(fieldMapping.predicateFor('Date start'))) {
      this.object.each(fieldMapping.predicateFor('Date start'), (triple) => {
        this.addStatement('dateStartYear', parseInt(triple.object_literal))
        this.addStatement('dateString', `${triple.object_literal}`)
      })
    }

    if (this.object.has(fieldMapping.predicateFor('Date end'))) {
      this.object.each(fieldMapping.predicateFor('Date end'), (triple) => {
        this.addStatement('dateEndYear', parseInt(triple.object_literal))
        this.addStatement('dateEndString', `${triple.object_literal}`)
      })
    }

    if (this.object.has(fieldMapping.predicateFor('Date created'))) {
      this.object.each(fieldMapping.predicateFor('Date created'), (triple) => {
        this.addStatement('createdYear', parseInt(triple.object_literal))
        this.addStatement('createdString', `${triple.object_literal}`)
      })
    }

    if (this.object.has(fieldMapping.predicateFor('Media type'))) {
      this.object.each(fieldMapping.predicateFor('Media type'), (triple) => {
        // Make sure we have a label. If we don't, it'll be indexed as a literal, when an obj is expected
        if (triple.object_label) this.addStatement('mediaType', triple.object_id, triple.object_label)
      })
    }
    if (this.object.has(fieldMapping.predicateFor('Carrier type'))) {
      this.object.each(fieldMapping.predicateFor('Carrier type'), (triple) => {
        // Make sure we have a label. If we don't, it'll be indexed as a literal, when an obj is expected
        if (triple.object_label) this.addStatement('carrierType', triple.object_id, triple.object_label)
      })
    }

    if (this.object.has(fieldMapping.predicateFor('Issuance'))) {
      this.object.each(fieldMapping.predicateFor('Issuance'), (triple) => {
        // Make sure we have a label. If we don't, it'll be indexed as a literal, when an obj is expected
        if (triple.object_label) this.addStatement('issuance', triple.object_id, triple.object_label)
      })
    }

    bibFieldMapper.getMapping('Language', (spec) => {
      this.object.each(spec.pred, (triple) => {
        // TODO this is a temporary hack to drop langauges that aren't mapped to a label
        if (triple.object_label) this.addStatement(spec.jsonLdKey, triple.object_id, triple.object_label)
      })
    })

    bibFieldMapper.getMapping('Call number', (spec) => {
      this.object.each(spec.pred, (triple) => {
        // Note we override the default jsonldkey (type) here because we're indexing rdf:type there:
        this.addStatement(spec.jsonLdKey, triple.object_literal)

        this.addStatement('identifierV2', { value: triple.object_literal, type: 'bf:ShelfMark' })
      })
    })

    bibFieldMapper.getMapping('Resource type', (spec) => {
      this.object.each(spec.pred, (triple) => {
        // Note we override the default jsonldkey (type) here because we're indexing rdf:type there:
        this.addStatement('materialType', triple.object_id, triple.object_label)
      })
    })

    // Add identifiers
    const identifierPred = fieldMapping.predicateFor('Identifier')
    const identifierBlanknodes = this.object.blankNodes(identifierPred)
      .map(parseIdentifierFromStatement)
    const identifierValues = this.object.statements(identifierPred)
      .map(parseIdentifierFromStatement)
      .concat(identifierBlanknodes)

    // Index identifier entity to 'identifierV2':
    identifierValues.forEach((identifier) => {
      this.addStatement('identifier', identifier.urnStyle)

      if (identifier.entityStyle) {
        this.addStatement('identifierV2', identifier.entityStyle)

        // Before adding identifier to special id field, make sure it doesn't
        // have a qualifying identifierStatus (e.g. canceled, invalid)
        if (!identifier.entityStyle.identifierStatus) {
          switch (identifier.entityStyle.type) {
            case 'nypl:Oclc':
              this.addStatement('idOclc', identifier.entityStyle.value)
              break
            case 'bf:Lccn':
              this.addStatement('idLccn', identifier.entityStyle.value)
              break
            case 'bf:Isbn':
              const isbn = identifier.entityStyle.value
              // Some records are catalogued with an extra colon at the end. We don't want the colon.
              const isbnWithoutFinalColon = isbn.replace(/:$/, '')
              this.addStatement('idIsbn', isbnWithoutFinalColon)
              const isbnClean = isbn.replace(/[^0-9xX]/g, '')
              this.addStatement('idIsbn_clean', isbnClean)
              break
            case 'bf:Issn':
              this.addStatement('idIssn', identifier.entityStyle.value)
              break
          }
        }
      }
    })

    // Add straightforward literals that need to preserve the order they were
    // saved in the store (By default, anything extracted via this.object.each
    // is sorted by object_id/object_literal)
    ; [
      'Contents',
      'Contents title'
    ].forEach((name) => {
      bibFieldMapper.getMapping(name, (spec) => {
        this.object.literals(spec.pred).forEach((literal) => {
          this.addStatement(spec.jsonLdKey, literal)
        })
      })
    })

    // Having added properties that require some special handling above,
    // now add a bunch of properties that are straightforward literals:

    const parallelFields = Object.entries(bibFieldMapper.data).filter(([k, v]) => k.includes('Parallel'))

    const parallelDisplayFields = parallelFields
      .filter(([k, v]) => v.elasticSearchKey === 'parallelDisplayField')
      .map(([k, v]) => k)

    const standardParallelFields = parallelFields.map(([k, v]) => k).filter((v) => !parallelDisplayFields.includes(v));

    [
      'Alternative title',
      'Dates of serial publication',
      'Description',
      'Dimensions',
      'Donor/Sponsor',
      'Extent',
      'Former title',
      'Genre/Form literal',
      'LCC classification',
      'Part of',
      'Place of publication',
      'Publication statement',
      'Publisher literal',
      'Series statement',
      'Subject literal',
      'Title',
      'Title display',
      'Uniform title'
    ].concat(
      standardParallelFields
    ).forEach((name) => {
      bibFieldMapper.getMapping(name, (spec) => {
        this.object.each(spec.pred, (triple) => {
          this.addStatement(spec.jsonLdKey, triple.object_literal)
        })
      })
    })

    parallelDisplayFields.forEach((name) => {
      bibFieldMapper.getMapping(name, (spec) => {
        this.object.each(spec.pred, (triple) => {
          this.addStatement(spec.elasticSearchKey, {
            fieldName: spec.parallelFieldName,
            index: triple.index,
            value: triple.object_literal
          })
        })
      })
    })

    // Add disaggregated subjects
    bibFieldMapper.getMapping('Subject literal', (spec) => {
      this.object.each(spec.pred, (triple) => {
        utils.explodedSubjectLiterals(triple).forEach((explodedSubjectLiteral) => {
          this.addStatement('subjectLiteral_exploded', explodedSubjectLiteral)
        })
      })
    })

    // Add finding aids and that sorta thing:
    bibFieldMapper.getMapping('Supplementary content', (spec) => {
      this.object.each(spec.pred, (triple) => {
        this.addStatement(spec.jsonLdKey, { url: triple.object_literal, label: triple.object_label })
      })
    })

    bibFieldMapper.getMapping('Note', (spec) => {
      this.object.blankNodes(spec.pred, (blankNode) => {
        this.addStatement(spec.indexPropertyName || spec.jsonLdKey, {
          type: 'bf:Note',
          noteType: blankNode.literal('bf:noteType'),
          label: blankNode.literal('rdfs:label')
        })
      })
    })

    var promises = []
    promises.push(Promise.resolve())

    // Ensure any non-electronic item or holding that does not have a shelfMark inherits one from bib
    let defaultShelfMark = this.object.literals('nypl:shelfMark')

    if (this.object._items) {
      // Add `[bibid]-[itemid]` to bib-level `uris` property for each item to aid retrieval of unified bib-item object
      this.statements.uris = this.statements.uris.concat(this.object._items.map((i) => [this.statements.uri, i.id].join('-')))
      const numElectronicItems = this.object._items.filter((item) => {
        return item.has('nypl:electronicLocator') || item.has('bf:electronicLocator')
      }).length
      // Serialize each `_items` through ResourceItemSerializer
      promises.push(Promise.all(this.object._items.map((item) => ResourceItemSerializer.serialize(item, this.object))).then((itemsSerialization) => {
        // Filtering out null (suppressed) items
        itemsSerialization = itemsSerialization.filter((r) => r)

        this.statements['items'] = itemsSerialization
          .map((item) => { return ResourceSerializer.applyDefaultShelfMark(item, defaultShelfMark) })
          .map(ResourceSerializer.applySortableShelfMark)
          .sort((i1, i2) => { return i1.shelfMark_sort > i2.shelfMark_sort ? 1 : -1 })

        this.addStatement('numItems', itemsSerialization.length - numElectronicItems)
        this.addStatement('numElectronicResources', numElectronicItems)

        var numAvailable = itemsSerialization.reduce((sum, item) => sum + (item.status && item.status.length > 0 && item.status[0].id === 'status:a' ? 1 : 0), 0)
        this.addStatement('numAvailable', numAvailable)
      }))
    }

    if (this.object._holdings) {
      this.statements.uris.push(...this.object._holdings.map((h) => `${this.statements.uri}-${h.id}`))

      promises.push(Promise.all(this.object._holdings.map(ResourceHoldingSerializer.serialize)).then((holdingSerialization) => {
        holdingSerialization = holdingSerialization.filter((h) => h)

        this.statements['holdings'] = holdingSerialization
          .map((holding) => {
            if (!holding.shelfMark) holding.shelfMark = defaultShelfMark

            // Add shelfMark to checkInBoxes
            if (holding.checkInBoxes) {
              holding.checkInBoxes.forEach((b) => {
                b.shelfMark = holding.shelfMark
              })

              // Sort boxes by postion
              holding.checkInBoxes.sort((b1, b2) => b1.position - b2.position)
            }

            return holding
          })
      }))
    }

    return Promise.all(promises).then(() => this.statements)
  }
}

/**
 * Get a sortable shelfmark value by collapsing whitespace and zero-padding
 * anything that looks like a box, volume, or tube number, identified as:
 *  - any number terminating the string, or
 *  - any number following known prefixes (e.g. box, tube, v., etc).
 *
 * If number is identified by prefix (e.g. box, tube), prefix will be made
 * lowercase.
 *
 * @return {string} A sortable version of the given shelfmark
 *
 * e.g.:
 *  "*T-Mss 1991-010   Box 27" ==> "*T-Mss 1991-010 box 000027"
 *  "*T-Mss 1991-010   Tube 70" ==> "*T-Mss 1991-010 tube 000070"
 *  "Map Div. 98­914    Box 25, Wi­Z')" ==> "Map Div. 98­914 box 000025, Wi­Z')"
 *
 * In addition to padding terminating numbers, any number following one of
 * these sequences anywhere in the string, case-insensitive, is padded:
 *  - box
 *  - tube
 *  - v.
 *  - no.
 *  - r.
 */
ResourceSerializer.sortableShelfMark = (shelfMark) => {
  // NodeJS doesn't have lookbehinds, so fake it with replace callback:
  const reg = /(\d+$|((^|\s)(box|v\.|no\.|r\.|box|tube) )(\d+))/i
  // This callback will receive all matches:
  const replace = (m0, fullMatch, label, labelWhitespace, labelText, number) => {
    // If we matched a label, build string from label and then pad number
    return label ? `${label.toLowerCase()}${ResourceSerializer.zeroPadString(number)}`
    // Otherwise just pad whole match (presumably it's a line terminating num):
      : ResourceSerializer.zeroPadString(fullMatch)
  }
  return shelfMark
    .replace(reg, replace)
    // Collapse redundant whitespace:
    .replace(/\s{2,}/g, ' ')
}

/**
 * Returns a '0' left-padded string to default length of 6
 */
ResourceSerializer.zeroPadString = (s, padLen = 6) => (new Array(Math.max(0, (padLen - s.length) + 1))).join('0') + s

/**
 * Add defaultShelfMark to item if needed
 */
ResourceSerializer.applyDefaultShelfMark = (item, defaultShelfMark) => {
  // Only set default shelfMark if not electronic
  if (!item.shelfMark && !item.electronicLocator) item.shelfMark = defaultShelfMark
  return item
}

/**
 * Add sortableShelfMark
 */
ResourceSerializer.applySortableShelfMark = (item) => {
  // Order by id if we have no call numbers, but make sure these items
  // go after items with call numbers
  if (!item.shelfMark || item.shelfMark.length === 0) {
    if (item.uri) {
      item.shelfMark_sort = 'b' + item.uri
    } else {
      item.shelfMark_sort = 'c'
    }
  } else {
    // order by call number, put these items first
    item.shelfMark_sort = 'a' + ResourceSerializer.sortableShelfMark(item['shelfMark'][0])
  }

  return item
}

ResourceSerializer.serialize = (resource) => (new ResourceSerializer(resource)).serialize()

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

module.exports = ResourceSerializer
