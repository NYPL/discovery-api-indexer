'use strict'

const log = require('loglevel')
const _ = require('highland')

const resourcesIndexer = require('../lib/resource-indexer')
const IndexerRunner = require('../lib/indexer-runner')
const index = require('../lib/index')
const envConfigHelper = require('../lib/env-config-helper')
const DiscoveryModels = require('discovery-store-models')

const { Bib } = DiscoveryModels

const cluster = require('cluster')

const VALID_TYPES = ['all', 'collection', 'component', 'item']

/*
 *  node jobs/index-resources --threads 3 [--index resources-scratch]
 *  node jobs/index-resources --threads 3 --index resources-2017-01-10
 */

// Parsc cmd line opts:
const argv = require('optimist')
  .usage('Index resources index with various types\nUsage: $0 -type TYPE')
  // .demand('type')
  .describe('type', 'Specify type to index (' + VALID_TYPES.join(', ') + ')')
  .default('bnum', null)
  .describe('bnum', 'Specify single bnum to inex')
  .boolean(['disablescreen', 'rebuild'])
  .default('threads', 1)
  .default('limit', 100)
  .default('offset', 0)
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
const INDEX_DISTINCT_RESOURCE_TYPES = false
if (INDEX_DISTINCT_RESOURCE_TYPES && VALID_TYPES.indexOf(argv.type) < 0) {
  console.log('Invalid type. Should be one of: ' + VALID_TYPES.join(', '))
  process.exit()
}

// Index single item by bnum:
if (argv.bnum) {
  console.log('Indexing bnum: ', argv.bnum)
  envConfigHelper.init({ discoveryStoreModels: DiscoveryModels, index, log })
    .then(() => DiscoveryModels.Bib.byId(argv.bnum))
    .then((s) => {
      log.debug('Got statements: ', s)
      return s
    })
    // .then((statements) => Bib.fromStatements(statements))
    .then((bib) => {
      return resourcesIndexer.processStreamOfBibs(_([bib]))
        .map((counts) => {
          console.log('Done: ', counts)
          return null
        })
        .done(() => {
        })
    })

// Master script:
} else if (cluster.isMaster) {
  const useScreen = !argv.disablescreen
  const rebuild = argv.rebuild

  const buildByQuery = function (query) {
    let limit = parseInt(argv.limit) || null
    // FIXME this is hardcoded for now until getting a distinct resources count isn't an expensive query..
    if (!limit) limit = 1000000

    let offset = parseInt(argv.offset) || null
    if (!offset) offset = 0

    return new Promise((resolve, reject) => {
      const runner = new IndexerRunner('resources', query, cluster, {
        botCount: argv.threads,
        useScreen,
        onComplete: resolve,
        limit,
        offset
      })
      runner.run()
    })
  }

  const tasks = []
  // tasks.push(() => index.resources.prepare(indexName, rebuild))
  tasks.push(() => buildByQuery({}))

  const buildNext = function () {
    if (tasks.length > 0) {
      return tasks.shift()()
        .then(buildNext)
        .catch((e) => {
          log.error('Error building: ' + e.message)
          process.exit()
        })
    }
  }

  envConfigHelper.init({ discoveryStoreModels: DiscoveryModels, index, log }).then((opts) => {
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

    let _received = false

    const processStream = (stream) => {
      const s = _(stream)
        .map((rec) => {
          if (!_received) {
            process.send({ log: 'received first record' })
            _received = true
          }
          return rec
        })
        .map((rec) => Bib.fromStatements(rec))

      return new Promise((resolve, reject) => {
        // Pass off stream of bibs to resources indexer
        resourcesIndexer.processStreamOfBibs(s, {
          notifyDocumentProcessed: false,
          onBatchComplete: (num) => {
            process.send({ totalUpdate: num })
          },
          onBibSuppressed: (bib) => {
            // For the purpose of tracking progress of batch job suppressed items should contribute to total:
            process.send({ totalUpdate: 1 })
          }
        })
          .map((counts) => {
            // This gives us counts.savedCount & counds.suppressedCount
            // if we care. We don't.
            return null
          })
          .done((s) => {
            log.info('Done')
            resolve(null)
          })
      })
    }

    envConfigHelper.init({ discoveryStoreModels: DiscoveryModels, index, log })
      .then(() => {
        process.send({ log: 'SQL query sent for ' + msg.start + ', limit ' + msg.total })
      })
      .then(() => DiscoveryModels.resources.bibsStream({ query: msg.query, offset: msg.start, limit: msg.total, batchSize: 500 }))
      .then(processStream)
      .then(DiscoveryModels.disconnect)
      .then(() => {
        process.send({ log: 'released DB' })
        process.exit()
      })
      .catch((e) => {
        console.log('error', e)
        console.trace(e)
      })
  })
}
