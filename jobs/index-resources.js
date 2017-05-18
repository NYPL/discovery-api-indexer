'use strict'

const config = require('config')
const log = require('loglevel')
const dotenv = require('dotenv')

const IndexerRunner = require('../lib/indexer-runner')
const ResourceSerializer = require('../lib/es-serializer').ResourceSerializer
const db = require('../lib/db')
const index = require('../lib/index')
const kmsHelper = require('../lib/kms-helper')

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
  .default('threads', 1)
  .default('limit', 100)
  .describe('disablescreen', 'If set, output printed to stdout rather than taking over screen with fancy visuals')
  .describe('rebuild', 'If set, all data in index deleted and new schema applied')
  .describe('index', 'Specify index name')
  .argv

  // don't do this because it's not passed to workers
  // .describe('loglevel', 'Specify log level (default info)')

var indexName = null

// TODO Need to resolve whether or not to index resources according to their domain type: collection, container, item, capture
// For now, not doing this. Seems to add more trouble than benefit atm
// This flag controls a couple local decision points,
// but making it `true` will not necessarily fully enable it
var INDEX_DISTINCT_RESOURCE_TYPES = false
if (INDEX_DISTINCT_RESOURCE_TYPES && VALID_TYPES.indexOf(argv.type) < 0) {
  console.log('Invalid type. Should be one of: ' + VALID_TYPES.join(', '))
  process.exit()
}

function dbConnect () {
  if (db.connected()) return Promise.resolve()
  else {
    return kmsHelper.decryptDbCreds()
      .then((uri) => db.setConnection(uri))
  }
}

function elasticConnect () {
  // If es is connected, return immediately:
  if (index.connected()) return Promise.resolve()
  // Otherwise, decrypt creds, and init es:
  else {
    return kmsHelper.decryptElasticCreds()
      .then((uri) => index.setConnection(uri))
  }
}

function init (initConnections) {
  initConnections = (typeof initConnections === 'undefined') ? true : initConnections

  // Ensure necessary env variables loaded
  dotenv.config({ path: './deploy.env' })
  dotenv.config({ path: './.env' })

  // What index are we writing to?
  // (First check --index, then pull from deploy.env, then default.)
  indexName = argv.index || process.env['ELASTIC_RESOURCES_INDEX_NAME'] || 'resources-2017-02-15-pb'
  log.info('Writing to ' + indexName)

  log.setLevel(process.env.LOGLEVEL || 'info')
  return initConnections ? Promise.all([ elasticConnect(), dbConnect() ]) : Promise.resolve()
}

// Index single item by uri:
if (argv.uri) {
  console.log('Indexing uri: ', argv.uri)
  init(true)
    .then(() => db.resources.bib(argv.uri))
    .then((s) => {
      log.debug('Got statements: ', s)
      return s
    })
    .then((statements) => ResourceSerializer.fromStatements(statements))
    .then((r) => {
      console.log('res: ', r)
      return r
    })
    .then((resource) => index.resources.save(indexName, [resource]))
    .then((result) => {
      if (result.errors) log.error('Errors: ', JSON.stringify(result, null, 2))
      else log.info('Done saving ' + argv.uri, result)
      // log.debug('Save result: ', JSON.stringify(result, null, 2))
    }, (err) => log.error('Error serializing: ', err))

// Master script:
} else if (cluster.isMaster) {
  var useScreen = !argv.disablescreen
  var rebuild = argv.rebuild

  var buildByQuery = function (query) {
    var limit = parseInt(argv.limit) || null
    // FIXME this is hardcoded for now until getting a distinct resources count isn't an expensive query..
    if (!limit) limit = 1000000

    return new Promise((resolve, reject) => {
      var runner = new IndexerRunner('resources', query, cluster, {
        botCount: argv.threads,
        useScreen: useScreen,
        onComplete: resolve,
        limit
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

  init(true).then(() => {
    if (rebuild) {
      // If rebuilding, make sure the currently configured index doesn't have a live alias
      index.admin.indexIsActive(indexName).then((active) => {
        if (active) {
          console.error('ABORT: Refusing to rebuild index that appears to be active')
          process.exit()
        } else {
          buildNext()
        }
      })
    } else buildNext()
  })

// Worker script:
} else {
  var _ = require('highland')

  // ask for where to start
  process.send({ start: true })

  process.on('message', (msg) => {
    if (typeof msg.start !== 'number') return

    var processed = 0
    var processStream = (stream) => {
      _(stream)
        .map((rec) => ResourceSerializer.fromStatements(rec))
        .flatMap((p) => _(p))
        .map((resource) => {
          processed += 1
          log.info('Index resource: ' + resource.uri + ' (offset ' + (msg.start + processed) + ')')
          return resource
        })
        .batchWithTimeOrCount(100, 1000)
        .map((recs) => index.resources.save(indexName, recs))
        .flatMap((p) => _(p))
        .stopOnError((e) => {
          log.error('error: ', e, e.stack)
        })
        .map((resp) => {
          process.send({ totalUpdate: resp.items.length })
        })
        .done((s) => console.log('Done? ', s))
    }

    init(true)
      .then(() => db.resources.bibs({ query: msg.query, offset: msg.start, limit: msg.total }))
      .then(processStream)
      .catch((e) => {
        console.log('error', e)
        console.trace(e)
      })
  })
}

