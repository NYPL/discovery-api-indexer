/*
  This is a lambda that listens to the discovery-queue-manager (https://github.com/NYPL-discovery/discovery-queue-manager)
  via a Kinesis stream that contains document URIs that should be indexed/re-indexed
  then runs the index job with the document URI
*/

var log = null

const DiscoveryStoreModels = require('discovery-store-models')
const index = require('./lib/index')
const kmsHelper = require('./lib/kms-helper')
const avroHelper = require('./lib/avro-helper')
const resourceIndexer = require('./lib/resource-indexer')

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

  // Ensure schemas loaded:
  avroHelper.getSchemas([INCOMING_SCHEMA_TYPE])
    .then((schemas) => {
      incomingSchema = schemas[INCOMING_SCHEMA_TYPE]

      // process kinesis records
      var ids = records
        .map(parseData)
        .map((record) => record.uri)

      return resourceIndexer.processArrayOfBibUris(ids)
        .then((result) => {
          const successMessage = [
            `Wrote ${result.savedCount} docs(s)`,
            (result.suppressedCount ? `suppressed ${result.suppressedCount} doc(s)` : null),
            (result.deletedCount ? `deleted ${result.deletedCount} doc(s)` : null)
          ].filter((m) => m).join(', ')

          callback(null, successMessage)
        })
    }).catch((e) => {
      callback(e)
    })
}

function dbConnect () {
  // If db is connected, return immediately:
  if (DiscoveryStoreModels.connected()) return Promise.resolve()
  // Otherwise, decrypt creds, and init db:
  else {
    return kmsHelper.decryptDbCreds()
      .then((uri) => DiscoveryStoreModels.connect(uri))
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
