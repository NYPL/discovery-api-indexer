const sinon = require('sinon')
const path = require('path')
const fs = require('fs')
const awsMock = require('aws-sdk-mock')

const DiscoveryStoreModels = require('discovery-store-models')
const { Bib } = DiscoveryStoreModels
const kmsHelper = require('../lib/kms-helper')

function bibFixturePath (id) {
  return path.join(__dirname, `./data/${id}.json`)
}

let getBibByFixture = function (id) {
  if (fs.existsSync(bibFixturePath(id))) {
    let data = JSON.parse(fs.readFileSync(bibFixturePath(id)))
    let bib = Bib.fromDbJsonResult(data)
    return Promise.resolve(bib)
  } else {
    return Promise.reject(new Error(id + ' not found on disk'))
  }
}

let getBibsByFixtures = function (ids) {
  return Promise.all(
    ids.map(
      (id) => getBibByFixture(id).catch((e) => null)
    )
  )
    // Filter out anything falsy (i.e. invalid bib id)
    .then((bibs) => bibs.filter((bib) => bib))
}

let fakeIndexResourcesSave = function (indexName, resources) {
  return Promise.resolve()
}

let fakeIndexResourcesDelete = function (indexName, id) {
  return Promise.resolve()
}

let fakeKinesisPutRecords = function (params, callback) {
  callback(null, { FailedRecordCount: 0, Records: params.Records })
}

function enable () {
  const index = require('../lib/index')

  process.env.NYPL_API_BASE_URL = 'https://platform.nypl.org/api/v0.1/'
  process.env.NYPL_API_SCHEMA_URL = 'https://platform.nypl.org/api/v0.1/current-schemas/'

  sinon.stub(Bib, 'byId').callsFake(getBibByFixture)
  sinon.stub(Bib, 'byIds').callsFake(getBibsByFixtures)
  sinon.stub(index.resources, 'save').callsFake(fakeIndexResourcesSave)
  sinon.stub(index.resources, 'delete').callsFake(fakeIndexResourcesDelete)
  awsMock.mock('Kinesis', 'putRecords', fakeKinesisPutRecords)
  sinon.stub(kmsHelper, 'decryptDbCreds').callsFake(() => Promise.resolve('postgresql://user:pass@example.com:5432/mocked-sql-creds'))
  sinon.stub(kmsHelper, 'decryptElasticCreds').callsFake(() => Promise.resolve('mocked-elastic-creds'))
}

function disable () {
  const index = require('../lib/index')

  Bib.byId.restore()
  Bib.byIds.restore()
  index.resources.save.restore()
  index.resources.delete.restore()
  awsMock.restore('Kinesis', 'putRecords')
  kmsHelper.decryptDbCreds.restore()
  kmsHelper.decryptElasticCreds.restore()
}

module.exports = { enable, disable }
