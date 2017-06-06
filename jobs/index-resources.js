'use strict'

const log = require('loglevel')
const _ = require('highland')

const resourcesIndexer = require('../lib/resource-indexer')
const IndexerRunner = require('../lib/indexer-runner')
const Bib = require('../lib/models/bib')
const db = require('../lib/db')
const index = require('../lib/index')
const envConfigHelper = require('../lib/env-config-helper')

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

// TODO Need to resolve whether or not to index resources according to their domain type: collection, container, item, capture
// For now, not doing this. Seems to add more trouble than benefit atm
// This flag controls a couple local decision points,
// but making it `true` will not necessarily fully enable it
var INDEX_DISTINCT_RESOURCE_TYPES = false
if (INDEX_DISTINCT_RESOURCE_TYPES && VALID_TYPES.indexOf(argv.type) < 0) {
  console.log('Invalid type. Should be one of: ' + VALID_TYPES.join(', '))
  process.exit()
}

// Index single item by uri:
if (argv.uri) {
  console.log('Indexing uri: ', argv.uri)
  envConfigHelper.init({ db, index, log })
    .then(() => db.resources.bib(argv.uri))
    .then((s) => {
      log.debug('Got statements: ', s)
      return s
    })
    .then((statements) => Bib.fromStatements(statements))
    .then((bib) => {
      return resourcesIndexer.processStreamOfBibs(_([bib]))
        .map((counts) => {
          console.log('Done: ', counts)
        })
        .done(() => {
        })
    })
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
  // tasks.push(() => index.resources.prepare(indexName, rebuild))
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

  envConfigHelper.init({ db, index, log }).then((opts) => {
    if (rebuild) {
      // If rebuilding, make sure the currently configured index doesn't have a live alias
      index.admin.indexIsActive(opts.indexName).then((active) => {
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
  // ask for where to start
  process.send({ start: true })

  process.on('message', (msg) => {
    if (typeof msg.start !== 'number') return

    var processStream = (stream) => {
      var s = _(stream)
        .map((rec) => Bib.fromStatements(rec))

      // Pass off stream of bibs to resources indexer
      return resourcesIndexer.processStreamOfBibs(s)
        .map((counts) => {
          // For the purpose of tracking progress of batch job, best to consider both suppressed and saved records as 'updates'
          process.send({ totalUpdate: counts.savedCount + counts.suppressedCount })
          log.info('Suppressed? ', counts.suppressedCount)
        })
        .done((s) => {
          log.info('Done')
          process.exit()
        })
    }

    envConfigHelper.init({ db, index, log })
      .then(() => db.resources.bibs({ query: msg.query, offset: msg.start, limit: msg.total }))
      .then(processStream)
      .catch((e) => {
        console.log('error', e)
        console.trace(e)
      })
  })
}

