'use strict'

const FieldMapping = require('./field-mapping').FieldMapping
const db = require('../lib/db')

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
            this.addStatement(spec.jsonldKey, triple.objectLiteral)
          })
        }
      })

      var titleSpec = fieldMapping.specFor('Title')
      if (this.object.has(titleSpec.predicate)) {
        var title = this.object.get(titleSpec.predicate).objectLiteral
        if (title) this.addStatement('title_sort', title.substring(0, 80).toLowerCase())
      }

      if (this.object.has(fieldMapping.predicateFor('Contributor literal'))) {
        this.object.each(fieldMapping.predicateFor('Contributor literal'), (triple) => {
          this.addStatement('contributor', triple.objectLiteral)
        })
        var contributor = this.object.get(fieldMapping.predicateFor('Contributor literal')).objectLiteral
        if (contributor) this.addStatement('contributor_sort', contributor.substring(0, 80).toLowerCase())
      }

      if (this.object.has(fieldMapping.predicateFor('Date start'))) {
        this.object.each(fieldMapping.predicateFor('Date start'), (triple) => {
          this.addStatement('dateStartYear', parseInt(triple.objectLiteral))
          this.addStatement('dateString', `${triple.objectLiteral}`)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Date end'))) {
        this.object.each(fieldMapping.predicateFor('Date end'), (triple) => {
          this.addStatement('dateEndYear', parseInt(triple.objectLiteral))
          this.addStatement('dateEndString', `${triple.objectLiteral}`)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Date created'))) {
        this.object.each(fieldMapping.predicateFor('Date created'), (triple) => {
          this.addStatement('createdYear', parseInt(triple.objectLiteral))
          this.addStatement('createdString', `${triple.objectLiteral}`)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Media type'))) {
        this.object.each(fieldMapping.predicateFor('Media type'), (triple) => {
          this.addStatement('mediaType', triple.objectUri, triple.label)
        })
      }
      if (this.object.has(fieldMapping.predicateFor('Carrier type'))) {
        this.object.each(fieldMapping.predicateFor('Carrier type'), (triple) => {
          this.addStatement('carrierType', triple.objectUri, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Issuance'))) {
        this.object.each(fieldMapping.predicateFor('Issuance'), (triple) => {
          this.addStatement('issuance', triple.objectUri, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Identifier'))) {
        this.object.each(fieldMapping.predicateFor('Identifier'), (triple) => {
          this.addStatement('identifier', triple.objectUri)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Language'))) {
        this.object.each(fieldMapping.predicateFor('Language'), (triple) => {
          this.addStatement('language', triple.objectUri, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Resource type'))) {
        this.object.each(fieldMapping.predicateFor('Resource type'), (triple) => {
          this.addStatement('materialType', triple.objectUri, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Publisher literal'))) {
        this.object.each(fieldMapping.predicateFor('Publisher literal'), (triple) => {
          this.addStatement('publisher', triple.objectLiteral, triple.label)
        })
      }

      // A bunch of unanalyzed literals:
      ; ['Dimensions', 'Extent', 'Note', 'Place of publication', 'Call number'].forEach((field) => {
        var predicate = fieldMapping.predicateFor(field)
        if (this.object.has(predicate)) {
          this.object.each(predicate, (triple) => {
            var apiField = triple.jsonldKey || predicate.split(':')[1]
            this.addStatement(apiField, triple.objectLiteral)
          })
        }
      })

      if (this.object.has(fieldMapping.predicateFor('Cover image'))) {
        this.object.each(fieldMapping.predicateFor('Cover image'), (triple) => {
          this.addStatement('btCover', triple.objectLiteral)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Instance of work'))) {
        this.object.each(fieldMapping.predicateFor('Instance of work'), (triple) => {
          // console.log('adding: ', fieldMapping.predicateFor('Instance of work'), 'idOwi', triple.objectUri)
          this.addStatement('idOwi', triple.objectUri)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('LCC classification'))) {
        this.object.each(fieldMapping.predicateFor('LCC classification'), (triple) => {
          // console.log('adding: ', fieldMapping.predicateFor('Instance of work'), 'idOwi', triple.objectUri)
          this.addStatement('idLcc', triple.objectUri)
        })
      }

      if (this.object.has('hathi:vols')) {
        this.object.each('hathi:vols', (triple) => {
          this.addStatement('hathiVols', triple.objectLiteral)
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

        this.object._items.forEach((item) => {
          if (item.has(fieldMapping.predicateFor('Location'))) {
            item.each(fieldMapping.predicateFor('Location'), (triple) => {
              // TODO: not mapped in context doc:
              this.addStatement('location', triple.objectUri, triple.label)
              this.addStatement('locations', triple.objectUri)

              // Add building location
              var locationUri = triple.objectUri.split(':')[1]
              promises.push(db.locations.findOne({ uri: locationUri }).then((loc) => {
                // console.log('parent building...', loc)
                // If location has a parent (isPartOf), that's the building
                if (loc['dcterms:isPartOf'] && loc['dcterms:isPartOf'].length) {
                  var parentLocationUri = loc['dcterms:isPartOf'][0].objectUri.split(':')[1]
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
              this.addStatement('supplementaryContent', { url: triple.objectLiteral, label: triple.label })
            })
          }

          var availabilityPred = fieldMapping.predicateFor('Availability')
          if (item.has(availabilityPred)) {
            item.each(availabilityPred, (triple) => {
              // this.addStatement('availability', triple.objectUri)
              this.addStatement('status', triple.objectUri, triple.label)
            })
          }

          var ownerPred = fieldMapping.predicateFor('Content owner')
          if (item.has(ownerPred)) {
            item.each(ownerPred, (triple) => {
              this.addStatement('owner', triple.objectUri, triple.label)
            })
          }

          var shelfmarkSpec = fieldMapping.specFor('Call number')
          if (item.has(shelfmarkSpec.predicate)) {
            item.each(shelfmarkSpec.predicate, (triple) => {
              this.addStatement(shelfmarkSpec.jsonldKey, triple.objectLiteral)
            })
          }

          // this.statements['uri'] = `${this.object.uri}-${item.uri}`
          this.addStatement('uris', `${this.object.uri}-${item.uri}`)
        })
      }

      return Promise.all(promises).then(() => this.statements)
    }, (error) => console.log('Error Serializing: ', error))
  }
}

ResourceSerializer.serialize = (resource) => (new ResourceSerializer(resource)).serialize()

class ResourceItemSerializer extends EsSerializer {
  serialize () {
    return FieldMapping.initialize('resources').then((fieldMapping) => {
      this.statements['uri'] = this.object.uri

      var locationPred = fieldMapping.predicateFor('Location')
      if (this.object.has(locationPred)) {
        this.addStatement('location', this.object[locationPred][0].objectUri, this.object[locationPred][0].label)
      }

      var identifierPred = fieldMapping.predicateFor('Identifier')
      if (this.object.has(identifierPred)) {
        this.object.each(identifierPred, (triple) => {
          this.addStatement('identifier', triple.objectUri)
        })
      }

      var availabilityPred = fieldMapping.predicateFor('Availability')
      if (this.object.has(availabilityPred)) {
        this.object.each(availabilityPred, (triple) => {
          // this.addStatement('availability', triple.objectUri)
          this.addStatement('status', triple.objectUri, triple.label)
        })
      }

      if (this.object.has(fieldMapping.predicateFor('Content owner'))) {
        this.object.each(fieldMapping.predicateFor('Content owner'), (triple) => {
          this.addStatement('owner', triple.objectUri, triple.label)
        })
      }

      var spec = fieldMapping.specFor('Call number')
      if (this.object.has(spec.predicate)) {
        this.object.each(spec.predicate, (triple) => {
          this.addStatement(spec.jsonldKey, triple.objectLiteral, triple.label)
        })
      }

      if (this.object.has('nypl:electronicLocator')) {
        this.object.each('nypl:electronicLocator', (triple) => {
          this.addStatement('electronicLocator', { url: triple.objectLiteral, label: triple.label })
        })
      }

      return this.statements
    })
  }
}

ResourceItemSerializer.serialize = (item) => (new ResourceItemSerializer(item)).serialize()

module.exports = { ResourceSerializer }
