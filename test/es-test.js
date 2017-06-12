/* global describe it before */

const assert = require('assert')
const dotenv = require('dotenv')
const log = require('loglevel')

var db = require('../lib/db')
var index = require('../lib/index')
var kmsHelper = require('../lib/kms-helper')

var DEFAULT_RESOURCES_INDEX = null

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

function init () {
  // Ensure necessary env variables loaded
  dotenv.config({ path: './deploy.env' })
  dotenv.config({ path: './.env' })

  log.setLevel(process.env.LOGLEVEL || 'info')

  DEFAULT_RESOURCES_INDEX = process.env['ELASTIC_RESOURCES_INDEX_NAME'] || 'resources-2017-02-15-pb'

  return Promise.all([ elasticConnect(), dbConnect() ])
}

describe('ES', function () {
  this.timeout(5000)

  before(init)

  describe('simple crud', function () {
    it('create, delete record', function () {
      // This is a nonsense doc to insert and delete:
      var testDoc = {
        'uri': 'test-record-1',
        'identifier': [
          'urn:bnum:10011745',
          'urn:lcc:BF712',
          'urn:lccCoarse:BF712-724.85',
          'urn:oclc:16911411'
        ],
        'type': [
          'nypl:Item'
        ],
        'contributor': [
          'International Society for the Study of Behavioral Development.'
        ]
      }

      // First, save it:
      return index.resources.save(DEFAULT_RESOURCES_INDEX, [testDoc])
        .then((record) => {
          // Check save result:
          assert.ok(record)
          assert.equal(record.errors, false)
        })
        // Now, delete it:
        .then(() => index.resources.delete(DEFAULT_RESOURCES_INDEX, testDoc.uri))
        .then((result) => {
          // Check deletion result:
          assert.ok(result)
          assert.equal(result.found, true)
          // assert.equal(result.errors, false)
        }).catch((e) => {
          console.log('Error: ', e)
          throw e
        })
    })
  })
})
