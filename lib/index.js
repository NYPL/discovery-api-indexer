const elasticsearch = require('elasticsearch')
const deepEqual = require('fast-deep-equal')

const log = require('loglevel')

const utils = require('./utils')

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
  // Identical to above, but stores a secondary `folded` field with folding
  fulltextFolded: {
    type: 'text',
    index: true,
    fields: {
      folded: {
        type: 'text',
        analyzer: 'folding'
      }
    }
  },
  // This type should be used for text properties that we want analyzed for
  // fuzzy searching, but we also want to store a raw copy for aggregations:
  // AND we anticipate accented chars we'd like folded:
  fulltextWithRawFolded: {
    type: 'text',
    index: true,
    fields: {
      raw: {
        type: 'keyword',
        eager_global_ordinals: true
      },
      folded: {
        type: 'text',
        analyzer: 'folding'
      }
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
  contentsTitle: mappingTemplates.fulltextFolded,
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
  dateString: mappingTemplates.exactString,
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
      accessMessage_packed: mappingTemplates.packed,
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
      status: mappingTemplates.entity,
      status_packed: mappingTemplates.packed,
      uri: mappingTemplates.exactString
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
  tableOfContents: mappingTemplates.fulltextFolded,
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

const reindexStatus = () => {
  return client().tasks.list({ actions: '*reindex', detailed: true }).then((resp) => {
    if (!resp.nodes || Object.keys(resp.nodes).length === 0) throw new Error('No current reindex jobs')
    if (Object.keys(resp.nodes).length !== 1) throw new Error(`Don't understand tasks response: ${JSON.stringify(resp, null, 2)}`)

    // Get matching node:
    const node = resp.nodes[Object.keys(resp.nodes)[0]]
    if (!node.tasks) throw new Error('No tasks found?')

    // Get tasks (should be one)
    const tasks = Object.keys(node.tasks)
      .map((nodeTaskId) => Object.assign({}, node.tasks[nodeTaskId], { nodeTaskId }))
    if (tasks.length !== 1) throw new Error('Found multiple reindex tasks?')

    const task = tasks.pop()

    const completed = (task.status.created + task.status.deleted + task.status.updated)
    const ellapsedSeconds = task.running_time_in_nanos / 1000000000
    const recordsPerSecond = (completed / ellapsedSeconds).toFixed(2)
    const remaining = task.status.total - completed
    const estimatedCompletionSeconds = remaining / recordsPerSecond
    const estimatedCompletionString = (function (time) {
      if (time > 60 * 60) return `${(time / 60 / 60).toFixed(2)}h`
      if (time > 60) return `${(time / 60).toFixed(2)}m`
      else return `${time}s`
    })(Math.floor(estimatedCompletionSeconds))
    const progress = completed / task.status.total
    const progressString = `${(progress * 100).toFixed(2)}%`
    const uri = `https://${__connection_uri}/_tasks/${task.nodeTaskId}`

    return {
      uri,
      completed,
      progress,
      progressString,
      remaining,
      estimatedCompletionSeconds,
      estimatedCompletionString,
      recordsPerSecond,
      task
    }
  })
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
              },
              en_stop_filter: {
                type: 'stop',
                stopwords: '_english_'
              },
              en_stem_filter: {
                type: 'stemmer',
                name: 'minimal_english'
              },
              spanish_stop: {
                type: 'stop',
                stopwords: '_spanish_'
              },
              icu_folding_filter: {
                type: 'icu_folding'
              },
              ascii_folding_filter: {
                type: 'asciifolding',
                preserve_original: true
              },
              unique_stem: {
                type: 'unique',
                only_on_same_position: true
              },
              strip_punctuation_filter: {
                type: 'pattern_replace',
                pattern: '[\']',
                replacement: ''
              }
              /*
               * This addresses a specific complaint, but doesn't address
               * core issue, so leaving it here as a note.
              synonym_filter: {
                type: 'synonym',
                synonyms: [
                  'lau, l au, la\'u'
                ]
              }
              */
            },
            analyzer: {
              default: {
                type: 'snowball',
                language: 'English'
              },
              folding: {
                tokenizer: 'icu_tokenizer',
                filter: [ 'lowercase', 'icu_folding_filter', 'en_stop_filter', 'keyword_repeat', 'en_stem_filter', 'unique_stem' ],
                char_filter: [
                  'extended_punctuation_char_filter'
                ]
              },
              lowercase_keyword_truncated: {
                type: 'custom',
                tokenizer: 'keyword',
                filter: ['lowercase', 'truncate_50']
              }
            },
            tokenizer: {
              edgeNgram_tokenizer: {
                type: 'edgeNGram',
                min_gram: '2',
                max_gram: '5',
                token_chars: [ 'letter' ]
              }
            },
            char_filter: {
              extended_punctuation_char_filter: {
                type: 'mapping',
                mappings: [
                  // It's unclear what version of the ICU Analysis plugin is
                  // in use in our ES 5.1 domain, but some character foldings
                  // don't seem to be working
                  // This one for example (https://unicode-table.com/en/02BC/ )
                  // should map to \u0080 based on ICU4J source circa 2014, but
                  // icu_tokenizer doesn't touch it.
                  '\u02BC => \u0027'
                ]
              }
            }
          }
        }
      } // body
    }).then(() => {
      log.info('Putting new ' + indexName + ' mapping')
      var body = {
        resource: {
          // Disable "dynamic mapping"; Throw error if an attempt is made to
          // index a property that doesn't exist in the mapping
          // https://www.elastic.co/guide/en/elasticsearch/reference/5.1/dynamic.html
          dynamic: 'strict',

          properties: resourcesProperties
        }
      }
      return client().indices.putMapping({ index: indexName, type: 'resource', body: body })
    })
  })
}

const getMapping = function (indexName) {
  return client().indices.getMapping({ index: [indexName] })
}

function mappingsDiff (localMapping, remoteMapping) {
  // Create a report consisting of { localOnlyProperties: [...], unequalMappings: [...], remoteOnlyMappings: [] }
  let report = Object.keys(localMapping)
    .reduce((report, property) => {
      // If it's nested, recurse:
      if (localMapping[property].type === 'nested') {
        let nestedReport = mappingsDiff(localMapping[property].properties, remoteMapping[property].properties)
        return Object.keys(nestedReport).reduce((newReport, key) => {
          newReport[key] = newReport[key].concat(nestedReport[key].map((instance) => {
            return Object.assign({}, instance, { property: `${property}.${instance.property}` })
          }))
          return newReport
        }, report)
      }

      const localProperty = localMapping[property]
      // Does property not exist in remote mapping?
      if (Object.keys(remoteMapping).indexOf(property) < 0) {
        report.localOnlyMappings.push({ property, local: localProperty })

      // So, property exists in both places. Compare them:
      } else {
        const remoteProperty = remoteMapping[property]
        // Remove irrelevant properties:
        const localPropertyClean = utils.deepFilterByKey(localProperty, (key, value) => {
          // Only keep index prop if it's set to false (because default is true)
          if (key === 'index') return value === false
          // Remove type prop if type='object':
          if (key === 'type') return value !== 'object'

          // Otherwise keep key:
          return true
        })

        if (!deepEqual(localPropertyClean, remoteProperty)) {
          report.unequalMappings.push({ property, local: localProperty, remote: remoteProperty })
        }
      }
      return report
    }, { localOnlyMappings: [], unequalMappings: [], remoteOnlyMappings: [] })

  // Add remoteOnly to report (mappings on server we don't recognize based on configuration):
  report.remoteOnlyMappings = report.remoteOnlyMappings.concat(
    Object.keys(remoteMapping)
      .filter((property) => Object.keys(localMapping).indexOf(property) < 0)
      .map((property) => ({ property, remote: remoteMapping[property] }))
  )

  return report
}

/**
 * Given an indexname, queries the remote mapping active on the server
 * and produces a hash with `msisingProperties` and `misMappedProperties`
 */
const mappingCheck = function (indexName) {
  return getMapping().then((remoteMapping) => {
    // Compare resourcesProperties against active, stored remoteMapping
    remoteMapping = remoteMapping[indexName].mappings.resource.properties

    const report = mappingsDiff(resourcesProperties, remoteMapping)

    return report
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

const search = (params) => {
  return client().search(params)
}

const scroll = (params) => {
  return client().scroll(params)
}

// Submit given array of 'resource' doc updates to elastic search as INSERTS/OVERWRITES
var indexResources = function (indexName, records, update) {
  log.debug('Index: Indexed ' + records.length + ' doc to ' + indexName)
  log.debug('Indexing: ', records)

  // Add updatedAt property to records:
  const updatedAt = (new Date()).getTime()
  records = records.map((record) => {
    return Object.assign({
      updatedAt
    }, record)
  })

  return _indexGeneric(indexName, records, update)
    .then((resp) => {
      log.debug('resp: ', JSON.stringify(resp))
      log.debug('Index: ' + (resp.errors ? 'Error' : 'Success'))
      return resp
    })
}

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
    mappingCheck,
    save: indexResources,
    delete: (index, id) => deleteRecord(index, 'resource', id),
    reindex: reindexResources,
    reindexStatus: reindexStatus
  },
  admin: {
    list: listIndexes,
    deleteIndex,
    setAlias: setAlias,
    indexIsActive
  },
  search,
  scroll,
  setConnection: setConnection,
  connected
}
