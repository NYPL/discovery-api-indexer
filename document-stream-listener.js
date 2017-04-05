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
const Kinesis = require('./lib/kinesis')
const kinesis = new Kinesis()
const avroHelper = require('./lib/avro-helper')

const INDEX_NAME = process.env['ELASTIC_RESOURCES_INDEX_NAME'] || 'resources-2017-02-15-pb'
const INCOMING_SCHEMA_TYPE = process.env['INCOMING_SCHEMA_TYPE'] || 'IndexDocument'
const OUTGOING_SCHEMA_TYPE = process.env['OUTGOING_SCHEMA_TYPE'] || 'IndexDocumentProcessed'

// kinesis stream handler
exports.kinesisHandler = function (records, context, callback) {
  log.info('Processing ' + records.length + ' record(s)')

  var incomingSchema = null
  var outgoingSchema = null

  // Ensure schemas loaded:
  avroHelper.getSchemas([INCOMING_SCHEMA_TYPE, OUTGOING_SCHEMA_TYPE])
    .then((schemas) => {
      incomingSchema = schemas[INCOMING_SCHEMA_TYPE]
      outgoingSchema = schemas[OUTGOING_SCHEMA_TYPE]

      // process kinesis records
      var data = records
        .map(parseData)

      var totalProcessed = 0

      // index each document
      _(data)
        .map(indexDocument)
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

  // executes a index resource job with URI
  function indexDocument (doc) {
    log.debug('Indexing ' + doc.uri)

    return db.resources.bib(doc.uri)
      .then((statements) => ResourceSerializer.fromStatements(statements))
      .then((resource) => {
        return index.resources.save(INDEX_NAME, [resource])
          .then((result) => {
            if (result && result.errors) return Promise.reject('Elastic reports errors: ' + result.errors)
            else return
          }, (err) => console.error('Error serializing: ', err))
          .then(() => {
            // TODO: This is hacked to deliver the internal standard identifiers;
            // All serialization flows should carry these identifiers w/out needing to derive them like this..
            var indexDocumentProcessed = {
              id: resource.uri.replace(/^[a-z]+/, ''),
              nyplSource: 'sierra-nypl',
              nyplType: 'bib'
            }
            return kinesis.write(indexDocumentProcessed, outgoingSchema)
          })
      })
      .then(() => ({ count: 1 }))
      .catch((e) => {
        // If it's just a bad bib id, quiet failure:
        if (e.name === 'QueryResultError') {
          log.info('Invalid bib id: ' + doc.uri + '. Moving on.')
          return { count: 0 }
        // Otherwise: throw error to stop all execution because it's probably not record specific:
        } else throw e
      })
  }

  // map to records objects as needed
  function parseData (payload) {
    // decode base64
    var buf = new Buffer(payload.kinesis.data, 'base64')
    // decode avro
    var record = incomingSchema.fromBuffer(buf)
    return record
  }
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
