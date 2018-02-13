const dotenv = require('dotenv')
const kmsHelper = require('../lib/kms-helper')
const aws = require('aws-sdk')

/**
* Set AWS profile
*/
function setProfile (profile) {
  // Set aws creds:
  aws.config.credentials = new aws.SharedIniFileCredentials({
    profile
  })

  // Set aws region:
  let awsSecurity = { region: 'us-east-1' }
  aws.config.update(awsSecurity)
}

function dbConnect (discoveryStoreModels) {
  if (discoveryStoreModels.connected()) return Promise.resolve()
  else {
    return kmsHelper.decryptDbCreds()
      .then((uri) => discoveryStoreModels.connect(uri))
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
  dotenv.config({ path: argv.envfile })
  dotenv.config({ path: './.env' })

  // What index are we writing to?
  // (First check --index, then pull from deploy.env, then default.)
  var indexName = process.env['ELASTIC_RESOURCES_INDEX_NAME'] || 'resources-2017-02-15-pb'

  // Initialize each given client
  var initializations = []
  if (clients.discoveryStoreModels) initializations.push(dbConnect(clients.discoveryStoreModels))
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

const argv = require('optimist').argv

// Require both --profile and --envfile
if (!argv.profile) throw new Error('--profile [aws profile] is a required flag')
if (!argv.envfile) throw new Error('--envfile config/[environment].env is a required flag')

// Set active aws profile (so that kms knows how to decrypt things)
setProfile(argv.profile)

module.exports = { init, getConfig }
