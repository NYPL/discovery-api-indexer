/*
  This is a lambda that listens to the discovery-queue-manager (https://github.com/NYPL-discovery/discovery-queue-manager)
  via a Kinesis stream that contains document URIs that should be indexed/re-indexed
  then runs the index job with the document URI
*/

var log = null

const _ = require('highland')

const db = require('./lib/db')
const index = require('./lib/index')
const ResourceSerializer = require('./lib/es-serializer').ResourceSerializer
const kmsHelper = require('./lib/kms-helper')
const avroHelper = require('./lib/avro-helper')

const NyplStreamsClient = require('@nypl/nypl-streams-client')

const INDEX_NAME = process.env['ELASTIC_RESOURCES_INDEX_NAME'] || 'resources-2017-02-15-pb'
const INCOMING_SCHEMA_TYPE = process.env['INCOMING_SCHEMA_TYPE'] || 'IndexDocument'
const OUTGOING_SCHEMA_TYPE = process.env['OUTGOING_SCHEMA_TYPE'] || 'IndexDocumentProcessed'

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

  function getResourceStatements (doc) {
    return db.resources.bib(doc.uri)
      .catch((e) => {
        // If it's just a bad bib id, quiet failure:
        if (e.name === 'QueryResultError') {
          log.info('Invalid bib id: ' + doc.uri + '. Moving on.')
          return null
        // Otherwise: throw error to stop all execution because it's probably not record specific:
        } else throw e
      })
  }

  function writeResourcesToIndex (resources) {
    log.debug('Saving batch of ' + resources.length + 'resources', resources)
    return index.resources.save(INDEX_NAME, resources)
      .then((result) => {
        if (result && result.errors) return Promise.reject('Elastic reports errors: ' + result.errors, JSON.stringify(result.errors, null, 2))
        else return
      })
      .then(() => resources)
  }

  function notifyIndexDocumentProcessed (resources) {
    // Build records to post to stream:
    var indexDocumentProcessedRecords = resources.map((resource) => {
      return {
        id: resource.uri.replace(/^[a-z]+/, ''),
        nyplSource: 'sierra-nypl',
        nyplType: 'bib'
      }
    })

    // Pass records to streams client:
    return (new NyplStreamsClient({ nyplDataApiClientBase: process.env['NYPL_API_BASE_URL'], logLevel: 'error' }))
      .write(OUTGOING_SCHEMA_TYPE, indexDocumentProcessedRecords)
      .then((res) => {
        log.info(`Wrote ${res.Records.length} records to ${OUTGOING_SCHEMA_TYPE}`)
      }).catch((e) => {
        log.error(`Error writing to to ${OUTGOING_SCHEMA_TYPE}`, e)
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

      // index each document
      _(data)
        // Look up statements by uri
        .map(getResourceStatements)
        .flatMap((h) => _(h))
        // Strip missing (null) records
        .compact()
        // Cast to wrapper class
        .map((statements) => ResourceSerializer.fromStatements(statements))
        .flatMap((h) => _(h))
        .map((r) => {
          // Check if suppressed:
          var suppressed = Array.isArray(r.suppressed) ? r.suppressed[0] : false
          if (suppressed) {
            log.info('Suppressing ' + r.uri)
            // Delete from index (in case previously not suppressed
            // Resolve `null` to indicate it should not be saved
            return index.resources.delete(INDEX_NAME, r.uri)
              .then((res) => null)
              .catch((e) => null)
          }
          return Promise.resolve(r)
        })
        .flatMap((h) => _(h))
        // Strip null (suppressed) records:
        .compact()
        // Batch write 100 at a time
        .batch(100)
        // Write to index in batches
        .map(writeResourcesToIndex)
        .flatMap((h) => _(h))
        // write to 'IndeDocumentProcessed' stream, passing count downstream
        .map((resources) => {
          return notifyIndexDocumentProcessed(resources)
            .then(() => ({ count: resources.length }))
        })
        .flatMap((h) => _(h))
        .stopOnError((e) => {
          callback(e)
        })
        // Count the number of successful indexings:
        .reduce(0, (total, result) => total + result.count)
        .map((count) => {
          // `reduce` reduced this to a one-item stream, but we have to `map` over it anyway to get count
          totalProcessed = count
        })
        .done(() => {
          log.info('Completed processing ' + totalProcessed + ' doc(s)')
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
