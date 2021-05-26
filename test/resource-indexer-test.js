const expect = require('chai').expect
const sinon = require('sinon')

const NyplStreamsClient = require('@nypl/nypl-streams-client')
const resourceIndexer = require('../lib/resource-indexer')

describe('resource-indexer', () => {
  describe('notifyIndexDocumentProcessed', () => {
    let recordsWritten = null

    const originalCoreVersion = process.env.NYPL_CORE_VERSION

    beforeEach(() => {
      // TODO: Setting a hard NYPL-Core version is temporary (although largely
      // future safe) and may be removed once the following is merged to
      // `master`:
      // https://github.com/NYPL/nypl-core/commit/e7548eaedd93c7dcbe17c82f61e299dfca1a9e13
      process.env.NYPL_CORE_VERSION = 'v1.37a'

      sinon.stub(NyplStreamsClient.prototype, 'write')
        .callsFake((stream, records, options) => {
          recordsWritten = records
          return Promise.resolve({ Records: records })
        })
    })

    afterEach(() => {
      process.env.NYPL_CORE_VERSION = originalCoreVersion
      NyplStreamsClient.prototype.write.restore()
      recordsWritten = null
    })

    it('generates correct messages for nypl bibs', () => {
      return resourceIndexer._internal.notifyIndexDocumentProcessed([
        {
          uri: 'b12082323'
        }
      ]).then(() => {
        expect(recordsWritten).to.be.a('array')
        expect(recordsWritten[0]).to.be.a('object')
        expect(recordsWritten[0].nyplType).to.eq('bib')
        expect(recordsWritten[0].nyplSource).to.eq('sierra-nypl')
        expect(recordsWritten[0].id).to.eq('12082323')
      })
    })

    it('generates correct messages for cul bibs', () => {
      return resourceIndexer._internal.notifyIndexDocumentProcessed([
        {
          uri: 'cb98765'
        }
      ]).then(() => {
        expect(recordsWritten).to.be.a('array')
        expect(recordsWritten[0]).to.be.a('object')
        expect(recordsWritten[0].nyplType).to.eq('bib')
        expect(recordsWritten[0].nyplSource).to.eq('recap-cul')
        expect(recordsWritten[0].id).to.eq('98765')
      })
    })

    it('generates correct messages for hl bibs', () => {
      return resourceIndexer._internal.notifyIndexDocumentProcessed([
        { uri: 'hb12345678910111213141516171819' },
        { uri: 'b12082323' }
      ]).then(() => {
        expect(recordsWritten).to.be.a('array')
        expect(recordsWritten[0]).to.be.a('object')
        expect(recordsWritten[0].nyplType).to.eq('bib')
        expect(recordsWritten[0].nyplSource).to.eq('recap-hl')
        expect(recordsWritten[0].id).to.eq('12345678910111213141516171819')
        expect(recordsWritten[1].nyplSource).to.eq('sierra-nypl')
        expect(recordsWritten[1].id).to.eq('12082323')
      })
    })
  })
})
