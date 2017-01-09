var config = require('config')

const elasticsearch = require('elasticsearch')

const RESOURCES_INDEX = config.get('elasticsearch').indexes.resources || 'discovery-resources2'

var __client = null
function client () {
  if (!__client) {
    __client = new elasticsearch.Client({
      host: config['elasticsearch']
    })
  }
  return __client
}

var prepareResourcesIndex = () => {
  var common_properties = {
    uri: {'type': 'string', 'index': 'not_analyzed'},
    parentUris: {'type': 'integer', 'index': 'not_analyzed'},
    rootParentUri: {'type': 'integer', 'index': 'not_analyzed'},
    parentUri: {'type': 'integer', 'index': 'not_analyzed'},
    parentUris_packed: {'type': 'string', 'index': 'not_analyzed'},
    rootParentUri_packed: {'type': 'string', 'index': 'not_analyzed'},
    title: { 'type': 'string', 'index': 'analyzed', 'fields': { 'folded': { 'type': 'string', 'analyzer': 'folding' } } },
    title_sort: { 'type': 'string', 'index': 'not_analyzed' },
    depiction: { 'type': 'string', 'index': 'not_analyzed' },
    description: {'type': 'string', 'index': 'analyzed'},
    type: {'type': 'string', 'index': 'not_analyzed'},
    materialType: {'type': 'string', 'index': 'not_analyzed'},
    materialType_packed: {'type': 'string', 'index': 'not_analyzed'},
    contributor: {'type': 'string', 'index': 'analyzed'},
    contributor_sort: {'type': 'string', 'index': 'not_analyzed'},
    contributor_packed: {'type': 'string', 'index': 'not_analyzed'},
    holdings: {'type': 'integer', 'index': 'not_analyzed'},
    note: {'type': 'string', 'index': 'analyzed'},
    suppressed: {'type': 'boolean', 'index': 'not_analyzed'},
    publicDomain: {'type': 'boolean', 'index': 'not_analyzed'},
    owner: {'type': 'string', 'index': 'not_analyzed'},
    owner_packed: {'type': 'string', 'index': 'not_analyzed'},
    subject: {'type': 'string', 'index': 'not_analyzed'},
    subject_packed: {'type': 'string', 'index': 'not_analyzed'},
    language: {'type': 'string', 'index': 'not_analyzed'},
    language_packed: {'type': 'string', 'index': 'not_analyzed'},
    identifier: {'type': 'string', 'index': 'not_analyzed'},
    created: {'type': 'date', 'index': 'not_analyzed'},
    createdYear: {'type': 'integer', 'index': 'not_analyzed'},
    createdDecade: {'type': 'integer', 'index': 'not_analyzed'},
    createdString: {'type': 'string', 'index': 'not_analyzed'},
    dateStartYear: {'type': 'integer', 'index': 'not_analyzed'},
    dateStartDecade: {'type': 'integer', 'index': 'not_analyzed'},
    dateStartString: {'type': 'string', 'index': 'not_analyzed'},
    dateEndYear: {'type': 'integer', 'index': 'not_analyzed'},
    dateEndDecade: {'type': 'integer', 'index': 'not_analyzed'},
    dateEndString: {'type': 'string', 'index': 'not_analyzed'},
    idLcc: {'type': 'string', 'index': 'not_analyzed'},
    idLccSort: {'type': 'string', 'index': 'not_analyzed'},
    location_packed: {'type': 'string', 'index': 'not_analyzed'},
    locationBuilding_packed: {'type': 'string', 'index': 'not_analyzed'},
    uris: {'type': 'string', 'index': 'not_analyzed'},
    subjectLiteral: {'type': 'string', 'index': 'not_analyzed'},
    carrierType: {'type': 'string', 'index': 'not_analyzed'},
    carrierType_packed: {'type': 'string', 'index': 'not_analyzed'},
    mediaType: {'type': 'string', 'index': 'not_analyzed'},
    mediaType_packed: {'type': 'string', 'index': 'not_analyzed'},
    publisher: {'type': 'string', 'index': 'not_analyzed'},
    placeOfPublication: {'type': 'string', 'index': 'not_analyzed'},
    extent: {'type': 'string', 'index': 'not_analyzed'},
    dimensions: {'type': 'string', 'index': 'not_analyzed'},
    issuance: {'type': 'string', 'index': 'not_analyzed'},
    issuance_packed: {'type': 'string', 'index': 'not_analyzed'},
    numItems: {'type': 'integer', 'index': 'not_analyzed'},
    numAvailable: {'type': 'integer', 'index': 'not_analyzed'},
    btCover: {'type': 'string', 'index': 'not_analyzed'},
    idOwi: {'type': 'string', 'index': 'not_analyzed'},
    idBarcode: {'type': 'string', 'index': 'not_analyzed'},
    locations: {'type': 'string', 'index': 'not_analyzed'},
    status: {'type': 'string', 'index': 'not_analyzed'},
    status_packed: {'type': 'string', 'index': 'not_analyzed'},
    supplementaryContent: {'type': 'object', properties: {
      url: { type: 'string', index: 'not_analyzed' },
      label: { type: 'string', index: 'not_analyzed' }
    }}
  }

  return client().indices.delete({ index: RESOURCES_INDEX }).then(() => {
    return client().indices.create({
      index: RESOURCES_INDEX,
      body: {
        settings: {
          number_of_shards: 3,
          analysis: {
            filter: {
              yearStrip: {
                type: 'pattern_replace',
                pattern: '[0-9]',
                replacement: ''
              }
            },
            analyzer: {
              default: {
                type: 'snowball',
                language: 'English'
              },
              folding: {
                tokenizer: 'edgeNgrame',
                filter: [ 'lowercase', 'asciifolding', 'yearStrip' ]
              }
            },
            tokenizer: {
              edgeNgrame: {
                type: 'edgeNGram',
                min_gram: '3',
                max_gram: '5',
                token_chars: [ 'letter' ]
              }
            }
          }
        }
      } // body
    }).then(() => {
      var body = { resource: { properties: common_properties } }
      console.log('rebuilding index: ', RESOURCES_INDEX, body)
      client().indices.putMapping({ index: RESOURCES_INDEX, type: 'resource', body: body })
    })
  }).catch((e) => {
    console.error('error rebuilding index: ', e)
  })
}

// Generic interface for posting data in bulk mode into elastic search
var _indexGeneric = function (indexName, records, update) {
  var body = []

  records.forEach(function (record) {
    var uri = (typeof record.uri) === 'object' ? record.uri[0] : record.uri
    // if (record.type === 'nypl:Item') uri = record

    var index_statement = { _index: indexName, _id: uri }
    // var index_statement = { _index: indexName }
    // var index_statement = { _index: indexName, _id: parseInt(record.uri.replace(/[^\d]/, '')) }
    index_statement._type = record._type ? record._type : 'resource'
    // No longer need the _type (and it's going to throw an error bc it's redundant??):
    delete record._type
    if (record._parent) {
      // No longer need the parent
      index_statement.parent = record._parent
      delete record._parent
    }
    // TODO: configure whether or not to delete first:
    if (false) body.push({ delete: { _index: indexName, _type: 'componentitem', _id: record.uri, _parent: index_statement._parent } })

    if (update) {
      delete record.uri
      record = { doc: record }
    }

    // Is this an update or an index (replaces doc)
    var actionLine = update ? { update: index_statement } : { index: index_statement }
    body.push(actionLine)
    body.push(record)
  })

  // console.log('saving: ', body)
  return client().bulk({ body: body }).then((resp) => {
    // console.log('bulk resp: ', JSON.stringify(resp, null, 2))
    return resp
  }, (err) => console.log('Error (_indexGeneric): ', err))
}

// Submit given array of 'resource' doc updates to elastic search as INSERTS/OVERWRITES
var indexResources = function (records, update) {
  return _indexGeneric(RESOURCES_INDEX, records, update)
}

/*
// Submit given array of 'resource' doc updates to elastic search as UPDATES
// Each doc must have an _id, a _type, and any other fields to update
var updateResources = function (records) {
  return _indexGeneric('resources', records, true)
}
*/

module.exports = {
  resources: {
    prepare: prepareResourcesIndex,
    save: indexResources
  }
}
