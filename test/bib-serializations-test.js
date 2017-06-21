/* global describe it before */

const assert = require('assert')
const dotenv = require('dotenv')
const log = require('loglevel')

const db = require('../lib/db')
const ResourceSerializer = require('../lib/es-serializer').ResourceSerializer
const Bib = require('../lib/models/bib')
const kmsHelper = require('../lib/kms-helper')

function dbConnect () {
  if (db.connected()) return Promise.resolve()
  else {
    return kmsHelper.decryptDbCreds()
      .then((uri) => db.setConnection(uri))
  }
}

function init () {
  // Ensure necessary env variables loaded
  dotenv.config({ path: './deploy.env' })
  dotenv.config({ path: './.env' })

  log.setLevel(process.env.LOGLEVEL || 'info')

  return Promise.all([ dbConnect() ])
}

describe('Bib Serializations', function () {
  this.timeout(5000)

  before(init)

  describe('items', function () {
    it.only('should have expected nypl owner', function () {
      return Bib.byId('b19834195').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].owner[0].id, 'orgs:1002')
          assert.equal(serialized.items[0].owner[0].label, 'New York Public Library for the Performing Arts, Dorothy and Lewis B. Cullman Center')
        })
      })
    })

    it.only('should have expected PUL owner', function () {
      return Bib.byId('pb176961').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].owner[0].id, 'orgs:0003')
          assert.equal(serialized.items[0].owner[0].label, 'Princeton University Library')
        })
      })
    })

    it.only('should be ordered correctly', function () {
      return Bib.byId('b19834195').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Ensure first item is Box 1
          assert.equal(serialized.items[0].shelfMark[0], '*T-Mss 1991-010 Box 1')
          assert.equal(serialized.items[1].shelfMark[0], '*T-Mss 1991-010 Box 2')
          assert.equal(serialized.items[9].shelfMark[0], '*T-Mss 1991-010 Box 10')

          // Ensure last item is Tube 70
          assert.equal(serialized.items[serialized.items.length - 1].shelfMark[0], '*T-Mss 1991-010 Tube 70')
        })
      })
    })
  })
})
