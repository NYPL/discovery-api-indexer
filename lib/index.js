const elasticsearch = require('elasticsearch')

const log = require('loglevel')

var __client = null
var __connection_uri = null
function client () {
  if (!__client) {
    __client = new elasticsearch.Client({
      // Try three different places for that connection uri!
      host: __connection_uri
    })
  }
  return __client
}

const mappingTemplates = {
  entity: {
    type: 'object',
    properties: {
      id: { type: 'keyword', index: true },
      label: { type: 'keyword', index: true }
    }
  },
  // This type should be used for "packed" fields containing ids & labels
  // munged together, which will only be matched exactly:
  packed: {
    index: true,
    type: 'keyword',
    eager_global_ordinals: true
  },
  // This type should be used for text that we don't need analyzed for fuzzy
  // searching, but we do want to be able to filter on it using exact matching:
  exactString: {
    index: true,
    type: 'keyword'
  },
  // This type should be used for text not worth analyzing for fuzzy-matching
  // and we don't expect to ever use it in an exact-match query either:
  exactStringNotIndexed: {
    index: false,
    type: 'keyword'
  },
  number: {
    index: true,
    type: 'short'
  },
  // This type should be used for text properties that we want analyzed for
  // fuzzy searching, and we never expect to build an aggregation across it:
  fulltext: {
    type: 'text',
    index: true
  },
  // This type should be used for text properties that we want analyzed for
  // fuzzy searching, but we also want to store a raw copy for aggregations:
  fulltextWithRaw: {
    type: 'text',
    index: true,
    fields: {
      raw: { type: 'keyword', eager_global_ordinals: true }
    }
  },
  boolean: {
    type: 'boolean',
    index: true
  }
}

// The following establishes the resource index mapping as it currently
// exists in dev & prod.
const resourcesProperties = {
  carrierType: mappingTemplates.entity,
  carrierType_packed: mappingTemplates.packed,
  contributorLiteral: mappingTemplates.fulltextWithRawFolded,
  contributor_sort: mappingTemplates.exactString,
  created: { type: 'date', index: false },
  createdDecade: mappingTemplates.number,
  createdString: mappingTemplates.exactString,
  createdYear: mappingTemplates.number,
  creatorLiteral: mappingTemplates.fulltextWithRawFolded,
  creator_sort: mappingTemplates.exactString,
  dateEndDecade: mappingTemplates.number,
  dateEndString: mappingTemplates.exactString,
  dateEndYear: mappingTemplates.number,
  dateStartDecade: mappingTemplates.number,
  dateStartString: mappingTemplates.exactString,
  dateStartYear: mappingTemplates.number,
  depiction: mappingTemplates.exactString,
  description: mappingTemplates.fulltextFolded,
  dimensions: mappingTemplates.exactString,
  extent: mappingTemplates.exactString,
  formerTitle: mappingTemplates.fulltextFolded,
  genreForm: mappingTemplates.fulltextWithRawFolded,
  idIsbn: mappingTemplates.exactString,
  idIssn: mappingTemplates.exactString,
  idLcc: mappingTemplates.exactString,
  idLccn: mappingTemplates.exactString,
  idLccSort: mappingTemplates.exactString,
  idOclc: mappingTemplates.exactString,
  idOwi: mappingTemplates.exactString,
  identifier: mappingTemplates.exactString,
  identifierV2: {
    properties: {
      value: mappingTemplates.exactString,
      type: mappingTemplates.exactString
    }
  },
  issuance: mappingTemplates.entity,
  issuance_packed: mappingTemplates.packed,
  items: {
    // This could be 'object', but we're making it 'nested' that items are indexed
    // independently of bibs per https://www.elastic.co/guide/en/elasticsearch/reference/current/nested.html
    type: 'nested',
    properties: {
      accessMessage: mappingTemplates.entity,
      catalogItemType: mappingTemplates.entity,
      catalogItemType_packed: mappingTemplates.packed,
      deliveryLocation: mappingTemplates.entity,
      deliveryLocation_packed: mappingTemplates.packed,
      electronicLocator: {
        properties: {
          url: mappingTemplates.exactString,
          label: { type: 'keyword', index: false }
        }
      },
      holdingLocation: mappingTemplates.entity,
      holdingLocation_packed: mappingTemplates.packed,
      identifier: mappingTemplates.exactString,
      identifierV2: {
        properties: {
          value: mappingTemplates.exactString,
          type: mappingTemplates.exactString
        }
      },
      idBarcode: mappingTemplates.exactString,
      location: mappingTemplates.entity,
      owner: mappingTemplates.entity,
      owner_packed: mappingTemplates.packed,
      requestable: mappingTemplates.boolean,
      status: mappingTemplates.entity
    }
  },
  language: mappingTemplates.entity,
  language_packed: mappingTemplates.packed,
  lccClassification: mappingTemplates.exactString,
  materialType: mappingTemplates.entity,
  materialType_packed: mappingTemplates.packed,
  mediaType: mappingTemplates.entity,
  mediaType_packed: mappingTemplates.packed,
  // Note that this is aliased `note` by discovery-api
  // This needs to be noteV3 temporarily as we transition from unstructured to structured in production
  note: {
    properties: {
      label: mappingTemplates.fulltextFolded,
      noteType: mappingTemplates.exactString,
      // This only ever contains 'bf:Note':
      type: mappingTemplates.exactStringNotIndexed
    }
  },
  numAvailable: mappingTemplates.number,
  numItems: mappingTemplates.number,
  partOf: mappingTemplates.exactString,
  placeOfPublication: mappingTemplates.exactString,
  publicDomain: mappingTemplates.boolean,
  publisherLiteral: mappingTemplates.fulltextWithRawFolded,
  publicationStatement: mappingTemplates.exactStringNotIndexed,
  serialPublicationDates: mappingTemplates.exactStringNotIndexed,
  seriesStatement: mappingTemplates.fulltextWithRawFolded,
  shelfMark: {
    // We're indexing this as text only so that it can be used in query_string
    // fulltext searches (if indexed keyword, can't by used fuzzily)
    type: 'text',
    index: true,
    fields: {
      raw: {
        type: 'keyword'
      }
    }
  },
  subjectLiteral: mappingTemplates.fulltextWithRawFolded,
  supplementaryContent: {
    type: 'object',
    properties: {
      url: mappingTemplates.exactString,
      label: { type: 'keyword', index: false }
    }
  },
  suppressed: mappingTemplates.boolean,
  title: mappingTemplates.fulltextFolded,
  title_sort: mappingTemplates.exactString,
  titleAlt: mappingTemplates.fulltextFolded,
  titleDisplay: mappingTemplates.fulltextFolded,
  type: mappingTemplates.exactString,
  uniformTitle: mappingTemplates.fulltextFolded,
  updatedAt: { type: 'date' },
  uri: mappingTemplates.exactString,
  uris: mappingTemplates.exactString
}

var reindexResources = (source, dest) => {
  // Build a part of the body config:
  var prepareConfigPart = (val) => {
    var part = {}

    var host = null
    if (/^http/.test(val)) {
      var url = require('url').parse(val)
      val = url.path.replace(/^\//, '')
      host = `${url.protocol}//${url.host}`
    }
    part.index = val
    if (host) part.remote = { host: host }

    return part
  }

  var params = {
    body: {
      source: prepareConfigPart(source),
      dest: prepareConfigPart(dest)
    }
  }

  console.log('return client().reindex(', JSON.stringify(params, null, 2))
  // return Promise.resolve()
  return client().reindex(params)
}

var prepareResourcesIndex = (indexName, deleteIfExists) => {
  // default deleteIfExists=false
  deleteIfExists = (typeof deleteIfExists) === 'undefined' ? false : deleteIfExists
  log.debug('Invoking prepareResourcesIndex on ' + indexName)

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
              },
              truncate_50: {
                type: 'truncate',
                length: 50
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
              },
              lowercase_keyword_truncated: {
                type: 'custom',
                tokenizer: 'keyword',
                filter: ['lowercase', 'truncate_50']
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
      var body = { resource: { properties: resourcesProperties } }
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

  return client().bulk({ body: body }).then((resp) => {
    return resp
  }, (err) => log.error('Error (_indexGeneric): ', err))
}

// Submit given array of 'resource' doc updates to elastic search as INSERTS/OVERWRITES
var indexResources = function (indexName, records, update) {
  log.debug('Index: Indexed ' + records.length + ' doc to ' + indexName)
  log.debug('Indexing: ', records)
  return _indexGeneric(indexName, records, update)
    .then((resp) => {
      log.debug('resp: ', JSON.stringify(resp))
      log.debug('Index: ' + (resp.errors ? 'Error' : 'Success'))
      return resp
    })
}

/*
// Submit given array of 'resource' doc updates to elastic search as UPDATES
// Each doc must have an _id, a _type, and any other fields to update
var updateResources = function (records) {
  return _indexGeneric('resources', records, true)
}
*/

var deleteRecord = function (index, type, id) {
  if (!id) throw new Error('deleteRecord needs an id: ', id)
  var h = { index, type, id }
  log.debug('Deleting resource: ' + JSON.stringify(h, null, 2))
  return client().delete(h)
}

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

const setConnection = (uri) => {
  log.debug('ES: Set connection URI: ' + uri.replace(/:[^@]+@/, ':...@'))
  __connection_uri = uri
}

const connected = () => {
  return Boolean(__connection_uri)
}

module.exports = {
  resources: {
    prepare: prepareResourcesIndex,
    save: indexResources,
    delete: (index, id) => deleteRecord(index, 'resource', id),
    reindex: reindexResources
  },
  admin: {
    list: listIndexes,
    deleteIndex,
    setAlias: setAlias,
    indexIsActive
  },
  setConnection: setConnection,
  connected
}
