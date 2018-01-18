/* global describe it before */

const assert = require('assert')
const dotenv = require('dotenv')
const log = require('loglevel')

const db = require('../lib/db')
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
  dotenv.config({ path: 'config/qa.env' })

  const aws = require('aws-sdk')

  // Set aws creds:
  aws.config.credentials = new aws.SharedIniFileCredentials({
    profile: 'nypl-sandbox'
  })

  // Set aws region:
  let awsSecurity = { region: 'us-east-1' }
  aws.config.update(awsSecurity)

  log.setLevel(process.env.LOGLEVEL || 'info')

  return Promise.all([ dbConnect() ])
}

describe('Item Model', function () {
  this.timeout(5000)

  before(init)

  it('should include itypes 132', function () {
    return Bib.byId('b17655587').then((bib) => {
      // This bib has 6 items at writing. Four are suppressed by icode2 rules.
      // Two have itype 132 and should not be suppressed. Those two should be
      // considered 'Research' because itype 132 has collectionType 'Research' in
      // https://github.com/NYPL/nypl-core/blob/master/vocabularies/json-ld/catalogItemTypes.json

      // Grab the two items with itype 132:
      let itemsWithHighItype = bib._items.filter((item) => item.objectId('nypl:catalogItemType') === 'catalogItemType:132')

      // Confirm there are two:
      assert.equal(itemsWithHighItype.length, 2)

      // Confirm each of them self reports as research:
      itemsWithHighItype.forEach((item) => {
        assert(item.isResearch())
      })
    })
  })
})
