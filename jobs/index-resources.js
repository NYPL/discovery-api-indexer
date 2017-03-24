'use strict'

const config = require('config')

const IndexerRunner = require('../lib/indexer-runner')
const ResourceSerializer = require('../lib/es-serializer').ResourceSerializer
const db = require('../lib/db')
const index = require('../lib/index')
const log = require('loglevel')

var cluster = require('cluster')

var VALID_TYPES = ['all', 'collection', 'component', 'item']

/*
 *  node jobs/index-resources --threads 3 [--index resources-scratch]
 *  node jobs/index-resources --threads 3 --index resources-2017-01-10
 */

// Parsc cmd line opts:
var argv = require('optimist')
  .usage('Index resources index with various types\nUsage: $0 -type TYPE')
  // .demand('type')
  .describe('type', 'Specify type to index (' + VALID_TYPES.join(', ') + ')')
  .default('uri', null)
  .describe('uri', 'Specify single uri to inex')
  .boolean(['disablescreen', 'rebuild'])
  .describe('disablescreen', 'If set, output printed to stdout rather than taking over screen with fancy visuals')
  .describe('rebuild', 'If set, all data in index deleted and new schema applied')
  .describe('loglevel', 'Specify log level (default info)')
  .describe('index', 'Specify index name')
  .argv

log.setLevel(argv.loglevel || 'info')

const DEFAULT_RESOURCES_INDEX = config.get('elasticsearch').indexes.resources
const indexName = argv.index || DEFAULT_RESOURCES_INDEX

// TODO Need to resolve whether or not to index resources according to their domain type: collection, container, item, capture
// For now, not doing this. Seems to add more trouble than benefit atm
// This flag controls a couple local decision points,
// but making it `true` will not necessarily fully enable it
var INDEX_DISTINCT_RESOURCE_TYPES = false
if (INDEX_DISTINCT_RESOURCE_TYPES && VALID_TYPES.indexOf(argv.type) < 0) {
  console.log('Invalid type. Should be one of: ' + VALID_TYPES.join(', '))
  process.exit()
}

/*
var attachItems = (bib) => {
  if (!bib) return Promise.resolve(bib)

  // console.log('looking up items for bib: ', bib.uri)
  return db.resources().then((resources) => {
    return resources.find({'rdf:type': 'nypl:Item', 'dcterms:identifier.objectUri': `urn:bnum:${bib.uri}`}).limit(100).toArray().then((items) => {
      // console.log('found? ', items)
      bib._items = items.map(db.TriplesDoc.from)
      return bib
    })
  })
}
*/

// Index single item by uri:
if (argv.uri) {
  console.log('uri: ', argv.uri)
  // db.resources.findOne({ uri: `${argv.uri}` }).then(attachItems).then((resource) => {
  db.resources.bib(argv.uri)
    .then((s) => {
      console.log('statements: ', s)
      return s
    })
    .then((statements) => ResourceSerializer.fromStatements(statements))
    // .then((resource) => index.resources.save(indexName, [resource]))
    .then((result) => {
      console.log('Done saving', JSON.stringify(result, null, 2))
    }, (err) => console.error('Error serializing: ', err))

// Master script:
} else if (cluster.isMaster) {
  var useScreen = !argv.disablescreen
  var rebuild = argv.rebuild

  var buildByQuery = function (query) {
    return new Promise((resolve, reject) => {
      var runner = new IndexerRunner('resources', query, cluster, {
        botCount: argv.threads,
        useScreen: useScreen,
        onComplete: resolve
      })
      runner.run()
    })
  }

  var tasks = []
  tasks.push(() => index.resources.prepare(indexName, rebuild))
  tasks.push(() => buildByQuery({}))

  var buildNext = function () {
    if (tasks.length > 0) {
      return tasks.shift()()
        .then(buildNext)
        .catch((e) => {
          log.error('Error building: ' + e.message)
          process.exit()
        })
    }
  }

  if (rebuild) {
    // If rebuilding, make sure the currently configured index doesn't have a live alias
    index.admin.indexIsActive(config.get('elasticsearch.indexes.resources')).then((active) => {
      if (active) {
        console.error('ABORT: Refusing to rebuild index that appears to be active')
        process.exit()
      } else {
        buildNext()
      }
    })
  } else buildNext()

// Worker script:
} else {
  var _ = require('highland')

  // ask for where to start
  process.send({ start: true })

  process.on('message', (msg) => {
    if (typeof msg.start !== 'number') return

    var processed = 0

    db.resources.bibs({ query: msg.query, offset: msg.start, limit: msg.total }).then((stream) => {
      _(stream)
        .map((rec) => ResourceSerializer.fromStatements(rec))
        .flatMap((p) => _(p))
        .map((resource) => {
          processed += 1
          log.info('Index resource: ' + resource.uri + ' (offset ' + (msg.start + processed) + ')')
          return resource
        })
        .batchWithTimeOrCount(100, 1000)
        .map((recs) => {
          // console.log('updating recs: ', recs.length)
          return recs
        })
        .map((recs) => index.resources.save(indexName, recs))
        .flatMap((p) => _(p))
        .stopOnError((e) => {
          log.error('error: ', e, e.stack)
        })
        .map((resp) => {
          process.send({ totalUpdate: resp.items.length })
        })
        .done((s) => console.log('done? ', s))
    }).catch((e) => {
      console.log('error', e)
      console.trace(e)
    })
  })
}

