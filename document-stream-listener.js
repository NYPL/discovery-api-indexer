/*
  This is a lambda that listens to the discovery-queue-manager (https://github.com/NYPL-discovery/discovery-queue-manager)
  via a Kinesis stream that contains document URIs that should be indexed/re-indexed
  then runs the index job with the document URI
*/

const log = require('loglevel')
log.info('Loading Document Stream Listener')

const _ = require('highland')
const avro = require('avsc')
const db = require('./lib/db')
const index = require('./lib/index')
const ResourceSerializer = require('./lib/es-serializer').ResourceSerializer
const kmsHelper = require('./lib/kms-helper')
const request = require('request')

const INDEX_NAME = process.env['ELASTIC_RESOURCES_INDEX_NAME'] || 'resources-2017-02-15-pb'
const SCHEMA_TYPE = process.env['INCOMING_SCHEMA_TYPE'] || 'IndexDocument'

// General purpose global hash of things to remember:
var CACHE = {}

log.setLevel(process.env['LOGLEVEL'] || 'info')

function getSchema () {
  // schema in cache; just return it as a instant promise
  if (CACHE[SCHEMA_TYPE]) {
    log.debug(`Already have ${SCHEMA_TYPE} schema`)
    return Promise.resolve(CACHE[SCHEMA_TYPE])
  }

  return new Promise((resolve, reject) => {
    var options = {
      uri: process.env['NYPL_API_SCHEMA_URL'] + SCHEMA_TYPE,
      json: true
    }

    log.debug(`Loading ${SCHEMA_TYPE} schema...`)
    request(options, (error, resp, body) => {
      if (error) {
        reject(error)
      }
      if (body.data && body.data.schema) {
        log.debug(`Sucessfully loaded ${SCHEMA_TYPE} schema`)
        var schema = JSON.parse(body.data.schema)
        CACHE[SCHEMA_TYPE] = avro.parse(schema)
        resolve(CACHE[SCHEMA_TYPE])
      } else {
        reject()
      }
    })
  })
}

// kinesis stream handler
exports.kinesisHandler = function (records, context, callback) {
  log.info('Processing ' + records.length + ' record(s)')

  // initialize avro schema
  const avroType = CACHE[SCHEMA_TYPE]

  // process kinesis records
  var data = records
    .map(parseData)

  // index each document
  _(data)
    .map(indexDocument)
    .flatMap((h) => _(h))
    .stopOnError((e) => {
      callback(e)
    })
    .done(() => {
      log.info('Completed processing ' + data.length + ' doc(s)')
      callback(null, 'Wrote ' + data.length + ' docs(s)')
    })

  // executes a index resource job with URI
  function indexDocument (doc) {
    log.debug('Indexing ' + doc.uri)

    return db.resources.bib(doc.uri)
      .then((statements) => ResourceSerializer.fromStatements(statements))
      .then((resource) => index.resources.save(INDEX_NAME, [resource]))
      .then((result) => {
        if (result && result.errors) return Promise.reject('Elastic reports errors: ' + result.errors)
        else return
      }, (err) => console.error('Error serializing: ', err))
  }

  // map to records objects as needed
  function parseData (payload) {
    // decode base64
    var buf = new Buffer(payload.kinesis.data, 'base64')
    // decode avro
    var record = avroType.fromBuffer(buf)
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

  Promise.all([ getSchema(), dbConnect(), elasticConnect() ])
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
