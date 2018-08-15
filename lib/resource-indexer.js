
const _ = require('highland')
const log = require('loglevel')

const NyplStreamsClient = require('@nypl/nypl-streams-client')

const index = require('./index')
const ResourceSerializer = require('./es-serializer').ResourceSerializer

const OUTGOING_SCHEMA_NAME = process.env['OUTGOING_SCHEMA_NAME'] || 'IndexDocumentProcessed'
const OUTGOING_STREAM_NAME = process.env['OUTGOING_STREAM_NAME'] || 'IndexDocumentProcessed'

function writeResourcesToIndex (resources) {
  log.debug('Saving batch of ' + resources.length + 'resources', resources)
  return index.resources.save(process.env['ELASTIC_RESOURCES_INDEX_NAME'], resources)
    .then((result) => {
      if (result && result.errors) return Promise.reject(new Error('Elastic reports errors: ' + result.errors + ': ' + JSON.stringify(result, null, 2)))
    })
    .then(() => resources)
}

function notifyIndexDocumentProcessed (resources) {
  // Build records to post to stream:
  var indexDocumentProcessedRecords = resources.map((resource) => {
    // Set nyplSource based on uri prefix:
    var nyplSource = 'sierra-nypl'
    if (/^cb/.test(resource.uri)) nyplSource = 'recap-cul'
    else if (/^pb/.test(resource.uri)) nyplSource = 'recap-pul'

    return {
      id: resource.uri.replace(/^[a-z]+/, ''),
      nyplSource,
      nyplType: 'bib'
    }
  })

  // Pass records to streams client:
  return (new NyplStreamsClient({ nyplDataApiClientBase: process.env['NYPL_API_BASE_URL'], logLevel: 'error' }))
    .write(OUTGOING_STREAM_NAME, indexDocumentProcessedRecords, { avroSchemaName: OUTGOING_SCHEMA_NAME })
    .then((res) => {
      log.info(`Wrote ${res.Records.length} records to ${OUTGOING_STREAM_NAME}`)
    }).catch((e) => {
      log.error(`Error writing to to ${OUTGOING_STREAM_NAME}`, e)
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
    return deleteResourceByUri(record.uri, { suppressErrors: true })
      .then((res) => {
        // Return `true` to indicate record was suppressed even if it errored
        // (note `suppressErrors: true` option above)
        // because likely issue is a 404 and we mainly want to prevent
        // further processing
        return true
      })
  }
  // Nothing suppressed
  return Promise.resolve(false)
}

function deleteResourceByUri (uri, options = { suppressErrors: true }) {
  return index.resources.delete(process.env['ELASTIC_RESOURCES_INDEX_NAME'], uri)
    // Suppress errors when deleting records because it's likely a 404
    .catch((e) => {
      if (!options.suppressErrors) throw e

      if (e.status === 404) log.debug(`Failed to delete ${uri} because it does not exist`)
      else log.debug(`Failed to delete ${uri}`, e)
    })
}

/**
 *  @typedef {Object} ProcessStreamOfBibsOptions
 *  @property {boolean} notifyDocumentProcessed - If true, will attempt to
 *    broadcast to DocumentProcessed stream
 *  @property {function } onBatchComplete - Callback to fire over successive
 *    batches. Default `() => null`
 *  @property {function } onBibSuppressed - Callback to fire when a suppression
 *    occurs. Default `() => null`
 */

/**
 *  @typedef {Object} ProcessStreamOfBibsResult
 *  @property {integer} savedCount - Number saved
 *  @property {integer} suppressedCount - Number suppressed (or not saved)
 *  @property {array<string>} updatedUris - Array of uris (ids with prefixes)
 */

/**
 *  This call does all the work of suppressing/updating index using given
 *  stream of Bib instances.
 *
 *  @param {HighlandStream} stream - Stream of records to process
 *  @param {ProcessStreamOfBibsOptions} opts
 *
 *  @returns {HighlandStream<ProcessStreamOfBibsResult>} - A stream instance
 *    with a single ProcessStreamOfBibsResult item
 *
 */
function processStreamOfBibs (stream, opts) {
  opts = Object.assign({
    notifyDocumentProcessed: true,
    onBatchComplete: (num) => null,
    onBibSuppressed: (bib) => null
  }, opts || {})

  var suppressedCount = 0
  let updatedUris = []

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
        .then(() => {
          updatedUris = updatedUris.concat(resources.map((resource) => resource.uri))
        })
        .then(() => ({ count: resources.length }))
    })
    .flatMap((h) => _(h))
    // Count the number of successful indexings:
    .reduce(0, (total, result) => total + result.count)
    .map((savedCount) => {
      return {
        savedCount,
        suppressedCount,
        updatedUris
      }
    })
}

module.exports = { processStreamOfBibs, deleteResourceByUri }
