/* global describe it beforeEach afterEach */

const expect = require('chai').expect
const _ = require('highland')

const DiscoveryStoreModels = require('discovery-store-models')
const { Bib } = DiscoveryStoreModels

const fixtures = require('./fixtures')

process.env.LOGLEVEL = process.env.LOGLEVEL || 'error'

describe('ResourcesIndexer', function () {
  this.timeout(5000)

  let ResourceIndexer

  beforeEach(() => {
    fixtures.enable()
    ResourceIndexer = require('../lib/resource-indexer')
  })

  afterEach(fixtures.disable)

  describe('#processStreamOfBibs', function () {
    it('should update two valid bibs', function () {
      return Promise.all([
        Bib.byId('b10681848'),
        Bib.byId('b10011745')
      ]).then((bibs) => {
        return new Promise((resolve, reject) => {
          let processingResult = null
          ResourceIndexer.processStreamOfBibs(_(bibs), { notifyDocumentProcessed: false })
            .map((ret) => {
              // This is the thing we want to resolve, but let's just set it
              // asside to resolve later
              processingResult = ret
            })
            // Call .done to trigger stream processing
            // Finish by resolving processingResult
            .done(() => {
              resolve(processingResult)
            })
        })
      })
      .then((processingResult) => {
        expect(processingResult).to.be.a('object')
        expect(processingResult.savedCount).to.equal(2)
        expect(processingResult.savedUris).to.be.a('array')
        expect(processingResult.savedUris).to.be.have.members(['b10681848', 'b10011745'])
        expect(processingResult.suppressedCount).to.equal(0)
      })
    })

    it('should update one valid bib, delete one invalid bib', function () {
      return Promise.all([
        Bib.byId('b10681848'),
        Bib.byId('b10011745suppressed')
      ]).then((bibs) => {
        return new Promise((resolve, reject) => {
          // Call .compact to Compact
          bibs = _(bibs).compact()

          let processingResult = null
          ResourceIndexer.processStreamOfBibs(bibs)
            .map((ret) => {
              // This is the thing we want to resolve, but let's just set it
              // asside to resolve later
              processingResult = ret
            })
            // Call .done to trigger stream processing
            // Finish by resolving processingResult
            .done(() => {
              resolve(processingResult)
            })
        })
      })
      .then((processingResult) => {
        expect(processingResult).to.be.a('object')
        expect(processingResult.savedCount).to.equal(1)
        expect(processingResult.savedUris).to.be.have.members(['b10681848'])
        expect(processingResult.suppressedCount).to.equal(1)
        expect(processingResult.suppressedUris).to.have.members(['b10011745suppressed'])
      })
    })
  })

  describe('processArrayOfBibUris', function () {
    it('should update one valid bib, suppress one suppressed bib, delete one invalid bib', function () {
      const index = require('../lib/index')

      return ResourceIndexer.processArrayOfBibUris(['b10610175', 'b10011745suppressed', 'bnonexistentbib'])
        .then((result) => {
          // We expect only one document to be saved:
          expect(index.resources.save.callCount).to.equal(1)
          // Confirm the 2nd arg (`records`) is an array with a single record,
          // which is the record we expect:
          expect(index.resources.save.firstCall.args[1]).to.be.a('array')
          expect(index.resources.save.firstCall.args[1]).to.have.lengthOf(1)
          expect(index.resources.save.firstCall.args[1][0]).to.be.an('object')
          expect(index.resources.save.firstCall.args[1][0].uri).to.equal('b10610175')

          // Although reported differently, suppressions are implemented as a
          // DELETE, so we expect two calls to DELETE:
          expect(index.resources.delete.callCount).to.equal(2)
          // Although they're ordered differently in the event, we expect non-
          // existent bibs to be deleted first, and bibs deleted due to
          // suppression to be deleted second:
          expect(index.resources.delete.firstCall.args[1]).to.equal('bnonexistentbib')
          expect(index.resources.delete.secondCall.args[1]).to.equal('b10011745suppressed')
        })
    })
  })
})
