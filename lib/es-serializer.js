'use strict'

const FieldMapping = require('./field-mapping').FieldMapping
const Bib = require('./models/bib')
const utils = require('./utils')
const log = require('loglevel')

class EsSerializer {
  constructor (object) {
    this.object = object
    this.statements = {}
  }

  addStatement (key, value, label) {
    if (this.hasStatement(key, value)) return this

    var _val = value
    if (label) _val = { id: value, label: label }

    if (!this.statements[key]) this.statements[key] = [_val]
    else this.statements[key].push(_val)

    if (label) {
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
    return FieldMapping.initialize('resources').then((fieldMapping) => {
      this.statements.uri = this.object.uri

      // If Bib is suppressed, fail serialization
      var suppressed = this.object.literal(fieldMapping.predicateFor('Suppressed')) === 'true'
      if (suppressed) {
        this.addStatement('suppressed', true)
        return this.statements
      }

      this.addStatement('uris', this.object.uri)

      this.addStatement('type', 'nypl:Item')

      // Mapped literals
      ; ['Title', 'Title display', 'Alternative title', 'Description', 'Subject literal'].forEach((property) => {
        var spec = fieldMapping.specFor(property)
        if (spec && this.object.has(spec.predicate)) {
          this.object.each(spec.predicate, (triple) => {
            this.addStatement(spec.jsonldKey, triple.object_literal)
          })
        }
      })

      var titleSpec = fieldMapping.specFor('Title')
      if (this.object.has(titleSpec.predicate)) {
        var title = this.object.get(titleSpec.predicate).object_literal
        if (title) this.addStatement('title_sort', title.substring(0, 80).toLowerCase())
      }

      if (this.object.has(fieldMapping.predicateFor('Contributor literal'))) {
        this.object.each(fieldMapping.predicateFor('Contributor literal'), (triple) => {
          this.addStatement('contributorLiteral', triple.object_literal)
        })
        var contributor = this.object.get(fieldMapping.predicateFor('Contributor literal')).object_literal
        if (contributor) this.addStatement('contributor_sort', contributor.substring(0, 80).toLowerCase())
      }

      if (this.object.has(fieldMapping.predicateFor('Creator literal'))) {
        this.object.each(fieldMapping.predicateFor('Creator literal'), (triple) => {
          this.addStatement('creatorLiteral', triple.object_literal)
        })
        var creator = this.object.get(fieldMapping.predicateFor('Creator literal')).object_literal
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

      if (this.object.has(fieldMapping.predicateFor('Identifier'))) {
        this.object.each(fieldMapping.predicateFor('Identifier'), (triple) => {
          this.addStatement('identifier', triple.object_id)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Language'))) {
        this.object.each(fieldMapping.predicateFor('Language'), (triple) => {
          // TODO this is a temporary hack to drop langauges that aren't mapped to a label
          if (triple.object_label) this.addStatement('language', triple.object_id, triple.object_label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Resource type'))) {
        this.object.each(fieldMapping.predicateFor('Resource type'), (triple) => {
          this.addStatement('materialType', triple.object_id, triple.object_label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Publisher literal'))) {
        this.object.each(fieldMapping.predicateFor('Publisher literal'), (triple) => {
          this.addStatement('publisher', triple.object_literal, triple.object_label)
        })
      }

      // A bunch of unanalyzed literals:
      ; ['Dimensions', 'Extent', 'Note', 'Place of publication', 'Call number'].forEach((field) => {
        var predicate = fieldMapping.predicateFor(field)
        if (this.object.has(predicate)) {
          this.object.each(predicate, (triple) => {
            var apiField = triple.jsonldKey || predicate.split(':')[1]
            this.addStatement(apiField, triple.object_literal)
          })
        }
      })

      if (this.object.has(fieldMapping.predicateFor('Cover image'))) {
        this.object.each(fieldMapping.predicateFor('Cover image'), (triple) => {
          this.addStatement('btCover', triple.object_literal)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Instance of work'))) {
        this.object.each(fieldMapping.predicateFor('Instance of work'), (triple) => {
          // console.log('adding: ', fieldMapping.predicateFor('Instance of work'), 'idOwi', triple.object_id)
          this.addStatement('idOwi', triple.object_id)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('LCC classification'))) {
        this.object.each(fieldMapping.predicateFor('LCC classification'), (triple) => {
          // console.log('adding: ', fieldMapping.predicateFor('Instance of work'), 'idOwi', triple.object_id)
          this.addStatement('idLcc', triple.object_id)
        })
      }

      if (this.object.has('hathi:vols')) {
        this.object.each('hathi:vols', (triple) => {
          this.addStatement('hathiVols', triple.object_literal)
        })
      }

      var promises = []
      promises.push(Promise.resolve())

      if (this.object._items) {
        // Add `[bibid]-[itemid]` to bib-level `uris` property for each item to aid retrieval of unified bib-item object
        this.statements.uris = this.statements.uris.concat(this.object._items.map((i) => [this.statements.uri, i.id].join('-')))

        promises.push(Promise.all(this.object._items.map(ResourceItemSerializer.serialize)).then((itemsSerialization) => {
          // Sort items by callnumber, id
          this.statements['items'] = itemsSerialization.sort((i1, i2) => {
            var shelfMark1 = i1['shelfMark'] ? i1['shelfMark'][0] : null
            var shelfMark2 = i2['shelfMark'] ? i2['shelfMark'][0] : null
            if (shelfMark1 && shelfMark2) return shelfMark1 > shelfMark2 ? 1 : -1
            else return i1['@id'] > i2['@id'] ? 1 : -1
          })
          this.addStatement('numItems', itemsSerialization.length)

          var numAvailable = itemsSerialization.reduce((sum, item) => sum + (item.status && item.status.length > 0 && item.status[0].id === 'status:a' ? 1 : 0), 0)
          this.addStatement('numAvailable', numAvailable)
        }))
      }

      return Promise.all(promises).then(() => this.statements)
    }, (error) => console.log('Error Serializing: ', error))
  }
}

ResourceSerializer.fromStatements = (s) => {
  // console.log('from statements: ', s)
  var doc = new Bib(s.bib_statements.map((s) => ({ subject_id: s.subject_id, predicate: s.pr, object_id: s.id, object_literal: s.li, object_label: s.la })))
  doc.uri = s.subject_id
  doc._items = []
  if (s.item_statements) {
    utils.groupBy(s.item_statements, 's')
    doc._items = utils.groupBy(s.item_statements, 's')
    doc._items = doc._items.map((stmts) => {
      var item = new Bib(stmts.map((s) => ({ subject_id: s.s, predicate: s.pr, object_id: s.id, object_literal: s.li, object_label: s.la })))
      item.uri = stmts[0].s
      return item
    })
  }
  return ResourceSerializer.serialize(doc)
}

ResourceSerializer.serialize = (resource) => (new ResourceSerializer(resource)).serialize()

class ResourceItemSerializer extends EsSerializer {
  serialize () {
    return FieldMapping.initialize('resources').then((fieldMapping) => {
      // If Item is suppressed, fail serialization
      var suppressed = this.object.literal(fieldMapping.predicateFor('Suppressed')) === 'true'
      if (suppressed) {
        log.info('Refusing to serialize suppressed ' + this.object.uri)
        return null
      }

      this.statements['uri'] = this.object.uri

      var locationPred = fieldMapping.predicateFor('Delivery location')
      if (this.object.has(locationPred)) {
        this.object.each(locationPred, (triple) => {
          this.addStatement('deliveryLocation', triple.object_id, triple.object_label)
        })
      }

      locationPred = fieldMapping.predicateFor('Holding location')
      if (this.object.has(locationPred)) {
        this.addStatement('holdingLocation', this.object.get(locationPred).object_id, this.object.get(locationPred).object_label)
      }

      var catalogItemTypePred = fieldMapping.predicateFor('Catalog item type')
      if (this.object.has(catalogItemTypePred)) {
        this.addStatement('catalogItemType', this.object.get(catalogItemTypePred).object_id, this.object.get(catalogItemTypePred).object_label)
      }

      var identifierPred = fieldMapping.predicateFor('Identifier')
      if (this.object.has(identifierPred)) {
        this.object.each(identifierPred, (triple) => {
          this.addStatement('identifier', triple.object_id)
        })
      }

      var availabilityPred = fieldMapping.predicateFor('Availability')
      if (this.object.has(availabilityPred)) {
        this.object.each(availabilityPred, (triple) => {
          this.addStatement('status', triple.object_id, triple.object_label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Content owner'))) {
        this.object.each(fieldMapping.predicateFor('Content owner'), (triple) => {
          this.addStatement('owner', triple.object_id, triple.object_label)
        })
      }

      // aka shelfMark
      var spec = fieldMapping.specFor('Call number')
      if (this.object.has(spec.predicate)) {
        this.object.each(spec.predicate, (triple) => {
          this.addStatement(spec.jsonldKey, triple.object_literal, triple.object_label)
        })

        // Let's also set prefLabel to callnumber because it's best for display (particularly for serials)
        this.addStatement('prefLabel', this.object.get(spec.predicate))
      }

      if (this.object.has('nypl:electronicLocator')) {
        this.object.each('nypl:electronicLocator', (triple) => {
          this.addStatement('electronicLocator', { url: triple.object_literal, label: triple.object_label })
        })
      }

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
    })
  }
}

ResourceItemSerializer.serialize = (item) => (new ResourceItemSerializer(item)).serialize()

module.exports = { ResourceSerializer }
