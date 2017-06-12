/*
  This is a lambda that listens to the discovery-queue-manager (https://github.com/NYPL-discovery/discovery-queue-manager)
  via a Kinesis stream that contains document URIs that should be indexed/re-indexed
  then runs the index job with the document URI
*/

var log = null

const _ = require('highland')

const db = require('./lib/db')
const index = require('./lib/index')
const Bib = require('./lib/models/bib')
const kmsHelper = require('./lib/kms-helper')
const avroHelper = require('./lib/avro-helper')
const resourcesIndexer = require('./lib/resource-indexer')

const INCOMING_SCHEMA_TYPE = process.env['INCOMING_SCHEMA_TYPE'] || 'IndexDocument'

// kinesis stream handler
exports.kinesisHandler = function (records, context, callback) {
  log.info('Processing ' + records.length + ' record(s)')

  var incomingSchema = null

  // map to records objects as needed
  function parseData (payload) {
    // decode base64
    var buf = new Buffer(payload.kinesis.data, 'base64')
    // decode avro
    var record = incomingSchema.fromBuffer(buf)
    return record
  }

  // Given an array of uris (bnums), returns a Promise that resolves multiple raw results
  function getResourceStatements (uris) {
    // Make sure it's an array:
    uris = Array.isArray(uris) ? uris : [uris]
    // Make sure none are repeated:
    uris = Object.keys(uris.reduce((h, uri) => {
      h[uri] = true
      return h
    }, {}))
    log.info('Fetching statements for ' + uris.join(', '))
    // Get bibs:
    return db.resources.bibs(uris)
      .catch((e) => {
        // If it's just a bad bib id, quiet failure:
        if (e.name === 'QueryResultError') {
          log.info('Invalid bib ids: ' + uris + '. Moving on.')
          return []
        // Otherwise: throw error to stop all execution because it's probably not record specific:
        } else throw e
      })
  }

  // Ensure schemas loaded:
  avroHelper.getSchemas([INCOMING_SCHEMA_TYPE])
    .then((schemas) => {
      incomingSchema = schemas[INCOMING_SCHEMA_TYPE]

      // process kinesis records
      var data = records
        .map(parseData)

      var totalProcessed = 0
      var totalSuppressed = 0

      // index each document
      var stream = _(data)
        // Just need the uri:
        .map((r) => r.uri)
        // Flatten stream to array:
        .reduce([], (a, uri) => a.concat([uri]))
        // Look up statements by uri
        .map(getResourceStatements)
        .flatMap((h) => _(h))
        // Now that we've the fetched bibs in a single array, feed them one by one into the stream:
        .sequence()
        // Strip missing (null) records
        .compact()
        // Cast to wrapper class
        .map((statements) => Bib.fromStatements(statements))

      // This call does all the work of suppressing/updating index using given stream of Bib instances
      // It returns a stream with one item giving stats
      return resourcesIndexer.processStreamOfBibs(stream)
        .map((counts) => {
          totalProcessed = counts.savedCount
          totalSuppressed = counts.suppressedCount
        })
        .stopOnError((e) => {
          callback(e)
        })
        .done(() => {
          log.info('Completed processing ' + totalProcessed + ' doc(s)')
          if (totalSuppressed) log.info('  Suppressed ' + totalSuppressed + ' doc(s)')
          callback(null, 'Wrote ' + totalProcessed + ' docs(s)')
        })
    }).catch((e) => {
      callback(e)
    })
}

function dbConnect () {
  // If db is connected, return immediately:
  if (db.connected()) return Promise.resolve()
  // Otherwise, decrypt creds, and init db:
  else {
    return kmsHelper.decryptDbCreds()
      .then((uri) => db.setConnection(uri))
      .then(() => {
        log.debug('Decrypted and set DB connection uri')
      })
  }
}

function elasticConnect () {
  // If es is connected, return immediately:
  if (index.connected()) return Promise.resolve()
  // Otherwise, decrypt creds, and init es:
  else {
    return kmsHelper.decryptElasticCreds()
      .then((uri) => index.setConnection(uri))
      .then(() => {
        log.debug('Decrypted and set ES connection uri')
      })
  }
}

// main function
exports.handler = function (event, context, callback) {
  context.callbackWaitsForEmptyEventLoop = false

  log = require('loglevel')
  log.setLevel(process.env['LOGLEVEL'] || 'info')

  log.info('Loading Document Stream Listener')

  log.debug('Root Handler got data: ', event)
  Promise.all([ dbConnect(), elasticConnect() ])
    .then(() => {
      var record = event.Records[0]
      if (record.kinesis) {
        exports.kinesisHandler(event.Records, context, callback)
      }
    })
    .catch((e) => {
      log.error('Error: ', e)
      callback(e)
    })
}
