
const _ = require('highland')
const log = require('loglevel')

const NyplStreamsClient = require('@nypl/nypl-streams-client')

const index = require('./index')
const ResourceSerializer = require('./es-serializer').ResourceSerializer

const OUTGOING_SCHEMA_TYPE = process.env['OUTGOING_SCHEMA_TYPE'] || 'IndexDocumentProcessed'

function writeResourcesToIndex (resources) {
  log.debug('Saving batch of ' + resources.length + 'resources', resources)
  return index.resources.save(process.env['ELASTIC_RESOURCES_INDEX_NAME'], resources)
    .then((result) => {
      if (result && result.errors) return Promise.reject('Elastic reports errors: ' + result.errors, JSON.stringify(result.errors, null, 2))
      else return
    })
    .then(() => resources)
}

function notifyIndexDocumentProcessed (resources) {
  // Build records to post to stream:
  var indexDocumentProcessedRecords = resources.map((resource) => {
    return {
      id: resource.uri.replace(/^[a-z]+/, ''),
      nyplSource: 'sierra-nypl',
      nyplType: 'bib'
    }
  })

  // Pass records to streams client:
  return (new NyplStreamsClient({ nyplDataApiClientBase: process.env['NYPL_API_BASE_URL'], logLevel: 'error' }))
    .write(OUTGOING_SCHEMA_TYPE, indexDocumentProcessedRecords)
    .then((res) => {
      log.info(`Wrote ${res.Records.length} records to ${OUTGOING_SCHEMA_TYPE}`)
    }).catch((e) => {
      log.error(`Error writing to to ${OUTGOING_SCHEMA_TYPE}`, e)
    })
}

function handleSuppression (record) {
  // Check conditions for deletion:
  var deleteResource = false

  // Check if suppressed:
  if (record.isSuppressed()) {
    log.info('Suppressing (because suppressed) ' + record.uri)
    deleteResource = true
  }

  // Make sure its currently considered a research bib:
  if (!record.isResearch()) {
    log.info('Suppressing (because non-research) ' + record.uri)
    deleteResource = true
  }

  if (deleteResource) {
    // Delete from index (in case previously not suppressed
    // Resolve `null` to indicate it should not be saved
    return index.resources.delete(process.env['ELASTIC_RESOURCES_INDEX_NAME'], record.uri)
      .then((res) => {
        return true
      })
      .catch((e) => {
        if (e.status === 404) log.debug('Failed to delete ' + record.uri + ' because it does not exist')
        else log.debug('Failed to delete ' + record.uri, e)
        // Return suppressed==true even if failed to delete record because likely 404
        // and we mainly want to prevent further processing
        return true
      })
  }
  // Nothing suppressed
  return Promise.resolve(false)
}

// This call does all the work of suppressing/updating index using given stream of Bib instances
// It returns a stream with one item holding:
//  * savedCount: Num saved
//  * suppressedCount: Num suppressed (or not saved)
function processStreamOfBibs (stream, opts) {
  opts = Object.assign({
    notifyDocumentProcessed: true,
    onBatchComplete: (num) => null,
    onBibSuppressed: (bib) => null
  }, opts || {})

  var suppressedCount = 0

  return stream
    // Suppress bibs that should be suppressed due to record suppression or to being non-research
    .map((record) => handleSuppression(record)
      .then((suppressed) => {
        if (suppressed) {
          // Keep track of number suppressed:
          suppressedCount += 1

          // Notify caller that bib was suppressed (IF IT EVEN CARES GAWD):
          opts.onBibSuppressed(record)

          // If record suppressed, write null to stream to prevent further processing
          return null
        }
        return record
      })
    )
    .flatMap((h) => _(h))
    // Strip null (suppressed) records:
    .compact()
    // Serialize to ES doc:
    .map((bib) => ResourceSerializer.serialize(bib))
    .flatMap((h) => _(h))
    // Batch write 100 at a time
    .batch(100)
    // Write to index in batches
    .map(writeResourcesToIndex)
    .flatMap((h) => _(h))
    // write to 'IndeDocumentProcessed' stream, passing count downstream
    .map((resources) => {
      // If configured to notify IndexDocumentProcessed stream, do so
      // otherwise resolve immediately:
      return (opts.notifyDocumentProcessed ? notifyIndexDocumentProcessed(resources) : Promise.resolve())
        .then(() => opts.onBatchComplete(resources.length))
        .then(() => ({ count: resources.length }))
    })
    .flatMap((h) => _(h))
    // Count the number of successful indexings:
    .reduce(0, (total, result) => total + result.count)
    .map((savedCount) => {
      return {
        savedCount,
        suppressedCount
      }
    })
}

module.exports = { processStreamOfBibs }
