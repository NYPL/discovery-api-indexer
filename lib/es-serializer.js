'use strict'

const FieldMapping = require('./field-mapping').FieldMapping
// const db = require('../lib/db')
const Bib = require('./models/bib')
const utils = require('./utils')

class EsSerializer {
  constructor (object) {
    this.object = object
    this.statements = {}
  }

  addStatement (key, value, label) {
    if (this.hasStatement(key, value)) return this

    if (!this.statements[key]) this.statements[key] = [value]
    else { //  if (this.statements[key]) {
      // if ((typeof this.statements[key]) !== 'object') this.statements[key] = [this.statements[key]]
      // console.log('push onto ', this.statements[key])
      this.statements[key].push(value)
    }
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
      this.addStatement('uris', this.object.uri)

      this.addStatement('type', 'nypl:Item') // this.object['rdf:type'])

      // Mapped literals
      ; ['Title', 'Alternative title', 'Description', 'Subject literal'].forEach((property) => {
        var spec = fieldMapping.specFor(property)
        if (this.object.has(spec.predicate)) {
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
          this.addStatement('contributor', triple.object_literal)
        })
        var contributor = this.object.get(fieldMapping.predicateFor('Contributor literal')).object_literal
        if (contributor) this.addStatement('contributor_sort', contributor.substring(0, 80).toLowerCase())
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
          this.addStatement('mediaType', triple.object_id, triple.label)
        })
      }
      if (this.object.has(fieldMapping.predicateFor('Carrier type'))) {
        this.object.each(fieldMapping.predicateFor('Carrier type'), (triple) => {
          this.addStatement('carrierType', triple.object_id, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Issuance'))) {
        this.object.each(fieldMapping.predicateFor('Issuance'), (triple) => {
          this.addStatement('issuance', triple.object_id, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Identifier'))) {
        this.object.each(fieldMapping.predicateFor('Identifier'), (triple) => {
          this.addStatement('identifier', triple.object_id)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Language'))) {
        this.object.each(fieldMapping.predicateFor('Language'), (triple) => {
          this.addStatement('language', triple.object_id, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Resource type'))) {
        this.object.each(fieldMapping.predicateFor('Resource type'), (triple) => {
          this.addStatement('materialType', triple.object_id, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Publisher literal'))) {
        this.object.each(fieldMapping.predicateFor('Publisher literal'), (triple) => {
          this.addStatement('publisher', triple.object_literal, triple.label)
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

      this.addStatement('suppressed', this.object.literal(fieldMapping.predicateFor('Suppressed'), false))

      var promises = []
      promises.push(Promise.resolve())

      if (this.object._items) {
        promises.push(Promise.all(this.object._items.map(ResourceItemSerializer.serialize)).then((itemsSerialization) => {
          this.statements['items'] = itemsSerialization
          this.addStatement('numItems', itemsSerialization.length)

          var numAvailable = itemsSerialization.reduce((sum, item) => sum + (item.status && item.status.length > 0 && item.status[0].match(/^status:a/) ? 1 : 0), 0)
          this.addStatement('numAvailable', numAvailable)
        }))

        /*
        this.object._items.forEach((item) => {
          if (item.has(fieldMapping.predicateFor('Location'))) {
            item.each(fieldMapping.predicateFor('Location'), (triple) => {
              // TODO: not mapped in context doc:
              this.addStatement('location', triple.object_id, triple.label)
              this.addStatement('locations', triple.object_id)

              // Add building location
              var locationUri = triple.object_id.split(':')[1]
              promises.push(db.locations.findOne({ uri: locationUri }).then((loc) => {
                // console.log('parent building...', loc)
                // If location has a parent (isPartOf), that's the building
                if (loc['dcterms:isPartOf'] && loc['dcterms:isPartOf'].length) {
                  var parentLocationUri = loc['dcterms:isPartOf'][0].object_id.split(':')[1]
                  // console.log('parent of ', this.object.uri, parentLocationUri)
                  return db.locations.findOne({ uri: parentLocationUri }).then((loc) => {
                    this.addStatement('locationBuilding', `loc:${loc.uri}`, loc.literal('skos:prefLabel'))
                    this.addStatement('locations', `loc:${loc.uri}`)
                  })
                // Otherwise the location itself is assumed to be building:
                } else {
                  // console.log('assuming is building:', loc)
                  this.addStatement('locationBuilding', `loc:${loc.uri}`, loc.literal('skos:prefLabel'))
                  this.addStatement('locations', `loc:${loc.uri}`)
                }
              }))
            })
          }

          // TODO This wasn't mapped before, but may now need to change to nypl:supp...
          var supplementaryPred = 'bf:supplementaryContent'
          if (this.object.has(supplementaryPred)) {
            this.object.each(supplementaryPred, (triple) => {
              this.addStatement('supplementaryContent', { url: triple.object_literal, label: triple.label })
            })
          }

          var availabilityPred = fieldMapping.predicateFor('Availability')
          if (item.has(availabilityPred)) {
            item.each(availabilityPred, (triple) => {
              // this.addStatement('availability', triple.object_id)
              this.addStatement('status', triple.object_id, triple.label)
            })
          }

          var ownerPred = fieldMapping.predicateFor('Content owner')
          if (item.has(ownerPred)) {
            item.each(ownerPred, (triple) => {
              this.addStatement('owner', triple.object_id, triple.label)
            })
          }

          var shelfmarkSpec = fieldMapping.specFor('Call number')
          if (item.has(shelfmarkSpec.predicate)) {
            item.each(shelfmarkSpec.predicate, (triple) => {
              this.addStatement(shelfmarkSpec.jsonldKey, triple.object_literal)
            })
          }

          // this.statements['uri'] = `${this.object.uri}-${item.uri}`
          this.addStatement('uris', `${this.object.uri}-${item.uri}`)
        })
        */
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
      this.statements['uri'] = this.object.uri

      var locationPred = fieldMapping.predicateFor('Location')
      if (this.object.has(locationPred)) {
        this.addStatement('location', this.object.get(locationPred).object_id, this.object.get(locationPred).label)
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
          // this.addStatement('availability', triple.object_id)
          this.addStatement('status', triple.object_id, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Content owner'))) {
        this.object.each(fieldMapping.predicateFor('Content owner'), (triple) => {
          this.addStatement('owner', triple.object_id, triple.label)
        })
      }

      var spec = fieldMapping.specFor('Call number')
      if (this.object.has(spec.predicate)) {
        this.object.each(spec.predicate, (triple) => {
          this.addStatement(spec.jsonldKey, triple.object_literal, triple.label)
        })
      }

      if (this.object.has('nypl:electronicLocator')) {
        this.object.each('nypl:electronicLocator', (triple) => {
          this.addStatement('electronicLocator', { url: triple.object_literal, label: triple.label })
        })
      }

      return this.statements
    })
  }
}

ResourceItemSerializer.serialize = (item) => (new ResourceItemSerializer(item)).serialize()

module.exports = { ResourceSerializer }
