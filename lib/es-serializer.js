'use strict'

const bibFieldMapper = require('./field-mapper')('bib')
const itemFieldMapper = require('./field-mapper')('item')
const log = require('loglevel')

class EsSerializer {
  constructor (object) {
    this.object = object
    this.statements = {}
  }

  addStatement (key, value, label, opts = {}) {
    opts = Object.assign({
      // By default, add a packed field if label is set
      addPackedField: label
    }, opts)

    if (this.hasStatement(key, value)) return this

    var _val = value
    if (label) _val = { id: value, label: label }

    if (!this.statements[key]) this.statements[key] = [_val]
    else this.statements[key].push(_val)

    if (opts.addPackedField) {
      this.addPackedStatement(key, value, label)
    }
    return this
  }

  hasStatement (key, value) {
    return this.statements[key] &&
      (
        ((typeof this.statements[key]) === 'object' && this.statements[key].indexOf(value) >= 0) ||
        ((typeof this.statements[key]) !== 'object' && this.statements[key] === value)
      )
  }

  addPackedStatement (key, value, label) {
    var packedVal = [value, label].join('||')
    return this.addStatement(`${key}_packed`, packedVal)
  }
}

class ResourceSerializer extends EsSerializer {
  serialize () {
    const fieldMapping = bibFieldMapper

    this.statements.uri = this.object.uri

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
      if (title) this.addStatement('title_sort', title.substring(0, 80).toLowerCase())
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

        this.addStatement('identifierV2', { value: triple.object_literal, type: 'bf:Barcode' })
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
    const identifierValues = this.object.statements(identifierPred)
      .map(parseIdentifierFromStatement)

    // Index identifier entity to 'identifierV2':
    identifierValues.forEach((identifier) => {
      this.addStatement('identifier', identifier.urnStyle)
      if (identifier.entityStyle) this.addStatement('identifierV2', identifier.entityStyle)
    })

    // Having added properties that require some special handling above,
    // now add a bunch of properties that are straightforward literals:
    ; [
      'Alternative title',
      'Dates of serial publication',
      'Description',
      'Dimensions',
      'Extent',
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
    ].forEach((name) => {
      bibFieldMapper.getMapping(name, (spec) => {
        this.object.each(spec.pred, (triple) => {
          this.addStatement(spec.jsonLdKey, triple.object_literal)
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

    /*
    if (this.object.has(fieldMapping.predicateFor('Instance of work'))) {
      this.object.each(fieldMapping.predicateFor('Instance of work'), (triple) => {
        this.addStatement('idOwi', triple.object_id)
      })
    }
    */

    var promises = []
    promises.push(Promise.resolve())

    if (this.object._items) {
      // Ensure any non-electronic item that not have a shelfMark inherits one from bib
      let defaultShelfMark = this.object.literals('nypl:shelfMark')

      // Add `[bibid]-[itemid]` to bib-level `uris` property for each item to aid retrieval of unified bib-item object
      this.statements.uris = this.statements.uris.concat(this.object._items.map((i) => [this.statements.uri, i.id].join('-')))

      // Serialize each `_items` through ResourceItemSerializer
      promises.push(Promise.all(this.object._items.map(ResourceItemSerializer.serialize)).then((itemsSerialization) => {
        // Filtering out null (suppressed) items
        itemsSerialization = itemsSerialization.filter((r) => r)

        this.statements['items'] = itemsSerialization
          // Add default shelfMark if missing:
          .map((item) => {
            // Only set default shelfMark if not electronic
            if (!item.shelfMark && !item.electronicLocator) item.shelfMark = defaultShelfMark
            return item
          })
          // Sort items by callnumber, id
          .sort((i1, i2) => {
            // If no shelfMark (i.e. electronic resource), list last
            if (!i1.shelfMark || i1.shelfMark.length === 0) return 1
            if (!i2.shelfMark || i2.shelfMark.length === 0) return -1

            // If we have callnumbers, order by those:
            if (i1['shelfMark'] && i2['shelfMark']) {
              // zero-pad trailing integers (box / tube /vol number)
              var shelfMark1 = zeroPadVolumeSuffix(i1['shelfMark'][0])
              var shelfMark2 = zeroPadVolumeSuffix(i2['shelfMark'][0])
              return shelfMark1 > shelfMark2 ? 1 : -1

            // Otherwise, order by id:
            } else return i1['@id'] > i2['@id'] ? 1 : -1
          })
        this.addStatement('numItems', itemsSerialization.length)

        var numAvailable = itemsSerialization.reduce((sum, item) => sum + (item.status && item.status.length > 0 && item.status[0].id === 'status:a' ? 1 : 0), 0)
        this.addStatement('numAvailable', numAvailable)
      }))
    }

    return Promise.all(promises).then(() => this.statements)
  }
}

/* Takes a shelfMark, returns a sortable shelfMark
 * Basically just zero-pads any trailing integer (assuming item shelfMarks look like ".. Box 1", ".. Tube 91")
 *
 * e.g.:
 *  "*T-Mss 1991-010 Box 27" ==> "*T-Mss 1991-010 Box 000027"
 *   "*T-Mss 1991-010 Tube 70" ==> "*T-Mss 1991-010 Tube 000070"
 */
function zeroPadVolumeSuffix (shelfMark) {
  // Assume box and tube numbers never exceed 999,999:
  var padLen = 6
  return shelfMark.replace(/\d+$/, (s) => (new Array(Math.max(0, (padLen - s.length) + 1))).join('0') + s)
}

ResourceSerializer.serialize = (resource) => (new ResourceSerializer(resource)).serialize()

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

        this.addStatement('identifierV2', { value: triple.object_literal, type: 'bf:Barcode' })
      })
    })

    // Add identifiers
    const identifierPred = fieldMapping.predicateFor('Identifier')
    const identifierValues = this.object.statements(identifierPred)
      .map(parseIdentifierFromStatement)

    // Index identifier entity to 'identifierV2':
    identifierValues.forEach((identifier) => {
      this.addStatement('identifier', identifier.urnStyle)
      if (identifier.entityStyle) this.addStatement('identifierV2', identifier.entityStyle)
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

  let type = statement.object_type
  if (!type && /^urn:\w+:/.test(statement.object_id)) {
    type = urnPrefixMap[statement.object_id.split(':')[1]]
  }

  let urnStyle = statement.object_id
  // Create urn style:
  if (statement.object_type && !/^urn:\w+:/.test(urnStyle)) {
    // Derive prefix from object_type:
    const prefix = Object.keys(urnPrefixMap)
      .filter((prefix) => urnPrefixMap[prefix] === statement.object_type)
      .pop()
    urnStyle = `urn:${prefix}:${statement.object_id}`
  }

  const ret = {
    urnStyle
  }
  if (type) {
    ret.entityStyle = {
      type,
      value: statement.object_id.replace(/^urn:\w+:/, '')
    }
  }
  return ret
}

ResourceItemSerializer.serialize = (item) => (new ResourceItemSerializer(item)).serialize()

module.exports = { ResourceSerializer }
