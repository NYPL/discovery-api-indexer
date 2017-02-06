var config = require('config')

const elasticsearch = require('elasticsearch')

const log = require('loglevel')

var __client = null
function client () {
  if (!__client) {
    __client = new elasticsearch.Client({
      host: config['elasticsearch']
    })
  }
  return __client
}

var genericEntityMapping = {
  type: 'object',
  properties: {
    id: { type: 'string', index: 'not_analyzed' },
    label: { type: 'string', index: 'not_analyzed' }
  }
}

var prepareResourcesIndex = (indexName, deleteIfExists) => {
  // default deleteIfExists=false
  deleteIfExists = (typeof deleteIfExists) === 'undefined' ? false : deleteIfExists
  log.debug('prepareResourcesIndex')

  var common_properties = {
    btCover: {'type': 'string', 'index': 'not_analyzed'},
    carrierType: genericEntityMapping,
    carrierType_packed: {'type': 'string', 'index': 'not_analyzed'},
    contributorLiteral: {'type': 'string', 'index': 'analyzed'},
    // contributor_packed: {'type': 'string', 'index': 'not_analyzed'},
    contributor_sort: {'type': 'string', 'index': 'not_analyzed'},
    created: {'type': 'date', 'index': 'not_analyzed'},
    createdDecade: {'type': 'integer', 'index': 'not_analyzed'},
    createdString: {'type': 'string', 'index': 'not_analyzed'},
    createdYear: {'type': 'integer', 'index': 'not_analyzed'},
    dateEndDecade: {'type': 'integer', 'index': 'not_analyzed'},
    dateEndString: {'type': 'string', 'index': 'not_analyzed'},
    dateEndYear: {'type': 'integer', 'index': 'not_analyzed'},
    dateStartDecade: {'type': 'integer', 'index': 'not_analyzed'},
    dateStartString: {'type': 'string', 'index': 'not_analyzed'},
    dateStartYear: {'type': 'integer', 'index': 'not_analyzed'},
    depiction: { 'type': 'string', 'index': 'not_analyzed' },
    description: {'type': 'string', 'index': 'analyzed'},
    dimensions: {'type': 'string', 'index': 'not_analyzed'},
    extent: {'type': 'string', 'index': 'not_analyzed'},
    // holdings: {'type': 'integer', 'index': 'not_analyzed'},
    idBarcode: {'type': 'string', 'index': 'not_analyzed'},
    idLcc: {'type': 'string', 'index': 'not_analyzed'},
    idLccSort: {'type': 'string', 'index': 'not_analyzed'},
    idOwi: {'type': 'string', 'index': 'not_analyzed'},
    identifier: {'type': 'string', 'index': 'not_analyzed'},
    issuance: genericEntityMapping,
    issuance_packed: {'type': 'string', 'index': 'not_analyzed'},
    items: {
      type: 'object',
      properties: {
        identifier: {'type': 'string', 'index': 'not_analyzed'},
        location: genericEntityMapping,
        owner: genericEntityMapping,
        status: genericEntityMapping,
        uri: {'type': 'string', 'index': 'not_analyzed'}
      }
    },
    language: genericEntityMapping,
    language_packed: {'type': 'string', 'index': 'not_analyzed'},
    locationBuilding: genericEntityMapping,
    locationBuilding_packed: {'type': 'string', 'index': 'not_analyzed'},
    locations: genericEntityMapping,
    location_packed: {'type': 'string', 'index': 'not_analyzed'},
    materialType: genericEntityMapping,
    materialType_packed: {'type': 'string', 'index': 'not_analyzed'},
    mediaType: genericEntityMapping,
    mediaType_packed: {'type': 'string', 'index': 'not_analyzed'},
    note: {'type': 'string', 'index': 'analyzed'},
    numAvailable: {'type': 'integer', 'index': 'not_analyzed'},
    numItems: {'type': 'integer', 'index': 'not_analyzed'},
    owner: genericEntityMapping,
    owner_packed: {'type': 'string', 'index': 'not_analyzed'},
    parentUri: {'type': 'integer', 'index': 'not_analyzed'},
    parentUris: {'type': 'integer', 'index': 'not_analyzed'},
    parentUris_packed: {'type': 'string', 'index': 'not_analyzed'},
    placeOfPublication: {'type': 'string', 'index': 'not_analyzed'},
    publicDomain: {'type': 'boolean', 'index': 'not_analyzed'},
    publisher: {'type': 'string', 'index': 'not_analyzed'},
    rootParentUri: {'type': 'integer', 'index': 'not_analyzed'},
    rootParentUri_packed: {'type': 'string', 'index': 'not_analyzed'},
    // subject: {'type': 'string', 'index': 'not_analyzed'},
    // subjectLiteral: {'type': 'string', 'index': 'not_analyzed'},
    status: genericEntityMapping,
    status_packed: {'type': 'string', 'index': 'not_analyzed'},
    subject_packed: {'type': 'string', 'index': 'not_analyzed'},
    supplementaryContent: {'type': 'object', properties: {
      url: { type: 'string', index: 'not_analyzed' },
      label: { type: 'string', index: 'not_analyzed' }
    }},
    suppressed: {'type': 'boolean', 'index': 'not_analyzed'},
    title: { 'type': 'string', 'index': 'analyzed', 'fields': { 'folded': { 'type': 'string', 'analyzer': 'folding' } } },
    title_sort: { 'type': 'string', 'index': 'not_analyzed' },
    type: {'type': 'string', 'index': 'not_analyzed'},
    uri: {'type': 'string', 'index': 'not_analyzed'},
    uris: {'type': 'string', 'index': 'not_analyzed'}
  }

  var ensureDoesNotExist = (index) => {
    log.debug('ensureDoesNotExist: ' + index + ' (deleteIfExists=' + deleteIfExists + ')')
    return client().indices.exists({ index }).then((exists) => {
      log.info('Preparing ' + index + ', which ' + (exists ? 'does' : 'does not') + ' exist')
      if (exists) {
        if (deleteIfExists) log.info('Deleting existing ' + index)
        // Only actually delete it if told to
        if (deleteIfExists) return client().indices.delete({ index })
        else throw new Error('Index ' + index + ' already exists. `deleteIfExists` is false, so aborting. Use --rebuild on cmd line')
      } else {
        // If it doesn't exist, proceed:
        return Promise.resolve()
      }
    })
  }

  // After ensuring it's deleted..
  return ensureDoesNotExist(indexName).then(() => {
    // Create it:
    log.info('Creating ' + indexName)
    return client().indices.create({
      index: indexName,
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
      log.info('Putting new ' + indexName + ' mapping')
      var body = { resource: { properties: common_properties } }
      return client().indices.putMapping({ index: indexName, type: 'resource', body: body })
    })
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
var indexResources = function (indexName, records, update) {
  return _indexGeneric(indexName, records, update)
}

/*
// Submit given array of 'resource' doc updates to elastic search as UPDATES
// Each doc must have an _id, a _type, and any other fields to update
var updateResources = function (records) {
  return _indexGeneric('resources', records, true)
}
*/

const indexIsActive = (index) => {
  return listIndexes(index).then((ind) => {
    if (ind.length === 0) throw new Error('Could not find index ' + index)

    return ind[0].aliases.length > 0
  }).catch((e) => false)
}

const listIndexes = (index) => {
  index = (typeof index) === 'undefined' ? '_all' : index

  return client().indices.getAlias({ index })
    .then((list) => {
      return client().indices.stats({ index }).then((stats) => {
        return Object.keys(list).map((index) => {
          var aliases = list[index]['aliases']
          aliases = Object.keys(aliases)
          return { index, aliases, count: stats.indices[index].total.docs.count }
        })
      })
    })
}

const setAlias = (opts) => {
  if (!opts.index) throw new Error('Must specify index in setAlias')
  if (!opts.alias) throw new Error('Must specify alias in setAlias')

  return listIndexes().then((list) => {
    var activatedIndex = list.filter((ind) => ind.index === opts.index)[0]
    if (!activatedIndex) throw new Error(`Invalid index: ${opts.index}`)

    var previousIndex = list.filter((ind) => ind.aliases.indexOf(opts.alias) >= 0)[0]
    if (!previousIndex && !opts.force) {
      console.warn('ABORT: Alias ' + opts.alias + ' was not previously assigned. Run with --force to override')
      process.exit()
    }
    if (activatedIndex.aliases.indexOf(opts.alias) >= 0) {
      console.warn('ABORT: Alias already exists; no change')
      process.exit()
    }

    var actions = []
    if (previousIndex) {
      actions.push({ remove: { index: previousIndex.index, alias: opts.alias } })
    }
    actions.push({ add: { index: opts.index, alias: opts.alias } })
    client().indices.updateAliases({ body: { actions } }).then((resp) => {
      return resp.acknowledged
    }, (e) => console.error(e.message, e.stack))

    // console.log('previous: ', previousIndex)
    return true
  })
}

const deleteIndex = (index) => {
  return listIndexes().then((list) => {
    if (list.filter((ind) => ind.index === index).length === 0) throw new Error(`Invalid index: ${index}`)

    var aliases = list.filter((ind) => ind.index === index)[0].aliases
    if (aliases.length > 0) throw new Error(`Index an alias: ${aliases.join(',')}`)

    return client().indices.delete({ index })
  })
}

module.exports = {
  resources: {
    prepare: prepareResourcesIndex,
    save: indexResources
  },
  admin: {
    list: listIndexes,
    deleteIndex,
    setAlias: setAlias,
    indexIsActive
  }
}
