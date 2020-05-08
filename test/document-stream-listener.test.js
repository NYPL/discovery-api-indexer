/* global describe it beforeEach afterEach */

const expect = require('chai').expect

const fixtures = require('./fixtures')

process.env.LOGLEVEL = process.env.LOGLEVEL || 'error'

describe('DocumentStreamListener [main]', function () {
  this.timeout(5000)

  let DocumentStreamListener

  beforeEach(() => {
    fixtures.enable()
    DocumentStreamListener = require('../document-stream-listener')
  })

  afterEach(fixtures.disable)

  describe('#handler', function () {
    it('should handle event single valid uri', function (done) {
      const sampleEvent = require('./data/sample-event-b10610175.json')

      const index = require('../lib/index')

      DocumentStreamListener.handler(sampleEvent, {}, (err, result) => {
        if (err) throw err

        expect(result).to.be.a('string')
        expect(result).to.equal('Wrote 1 docs(s)')
        // Nothing should have been deleted:
        expect(index.resources.delete.callCount).to.equal(0)
        expect(index.resources.save.callCount).to.equal(1)
        // Confirm the 2nd arg (`records`) is an array with a single record,
        // which is the record we expect:
        expect(index.resources.save.firstCall.args[1]).to.be.a('array')
        expect(index.resources.save.firstCall.args[1]).to.have.lengthOf(1)
        expect(index.resources.save.firstCall.args[1][0]).to.be.an('object')
        expect(index.resources.save.firstCall.args[1][0].uri).to.equal('b10610175')

        done()
      })
    })

    it('should handle event with single suppressed uri', function (done) {
      const sampleEvent = require('./data/sample-event-b10011745suppressed.json')

      const index = require('../lib/index')

      DocumentStreamListener.handler(sampleEvent, {}, (err, result) => {
        if (err) throw err

        expect(result).to.be.a('string')
        expect(result).to.equal('Wrote 0 docs(s), suppressed 1 doc(s)')
        // We expect no documents to have been saved:
        expect(index.resources.save.callCount).to.equal(0)
        // We expect a single delete due to suppression:
        expect(index.resources.delete.callCount).to.equal(1)
        // Confirm the 2nd arg (`id`) is the id we expect to delete:
        expect(index.resources.delete.firstCall.args[1]).to.equal('b10011745suppressed')

        done()
      })
    })

    it('should handle event with single deleted uri', function (done) {
      const sampleEvent = require('./data/sample-event-bnonexistentbib.json')

      const index = require('../lib/index')

      DocumentStreamListener.handler(sampleEvent, {}, (err, result) => {
        if (err) throw err

        expect(result).to.be.a('string')
        expect(result).to.equal('Wrote 0 docs(s), deleted 1 doc(s)')
        // We expect no documents to have been saved:
        expect(index.resources.save.callCount).to.equal(0)
        // We expect a single delete due to suppression:
        expect(index.resources.delete.callCount).to.equal(1)
        // Confirm the 2nd arg (`id`) is the id we expect to delete:
        expect(index.resources.delete.firstCall.args[1]).to.equal('bnonexistentbib')

        done()
      })
    })

    it('should handle event with three uris: one valid, one suppressed, one invalid', function (done) {
      const sampleEvent = require('./data/sample-event-b10610175-b10011745suppressed-bnonexistentbib.json')

      const index = require('../lib/index')

      DocumentStreamListener.handler(sampleEvent, {}, (err, result) => {
        if (err) throw err

        expect(result).to.be.a('string')
        expect(result).to.equal('Wrote 1 docs(s), suppressed 1 doc(s), deleted 1 doc(s)')

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

        done()
      })
    })
  })
})
