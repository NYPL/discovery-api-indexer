const dotenv = require('dotenv')
const kmsHelper = require('../lib/kms-helper')

function dbConnect (db) {
  if (db.connected()) return Promise.resolve()
  else {
    return kmsHelper.decryptDbCreds()
      .then((uri) => db.setConnection(uri))
  }
}

function elasticConnect (index) {
  // If es is connected, return immediately:
  if (index.connected()) return Promise.resolve()
  // Otherwise, decrypt creds, and init es:
  else {
    return kmsHelper.decryptElasticCreds()
      .then((uri) => index.setConnection(uri))
  }
}

// For debugging, mainly:
function getConfig () {
  return Promise.all([
    kmsHelper.decryptElasticCreds().then((v) => ({ elastic: v })),
    kmsHelper.decryptDbCreds().then((v) => ({ db: v }))
  ]).then((configs) => {
    configs.push({ indexName: process.env['ELASTIC_RESOURCES_INDEX_NAME'], loglevel: process.env.LOGLEVEL || 'info' })
    return Object.assign.apply(null, configs)
  })
}

function init (clients) {
  // Ensure necessary env variables loaded
  dotenv.config({ path: './deploy.production.env' })
  dotenv.config({ path: './.env' })

  // What index are we writing to?
  // (First check --index, then pull from deploy.env, then default.)
  var indexName = process.env['ELASTIC_RESOURCES_INDEX_NAME'] || 'resources-2017-02-15-pb'

  // Initialize each given client
  var initializations = []
  if (clients.db) initializations.push(dbConnect(clients.db))
  if (clients.index) initializations.push(elasticConnect(clients.index))

  if (clients.log) {
    clients.log.setLevel(process.env.LOGLEVEL || 'info')
    clients.log.info('Writing to ' + indexName)
  }

  return (initializations.length > 0 ? Promise.all(initializations) : Promise.resolve())
    .then(() => {
      return { indexName }
    })
}

module.exports = { init, getConfig }
