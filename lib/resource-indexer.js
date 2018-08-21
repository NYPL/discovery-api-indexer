
const _ = require('highland')
const log = require('loglevel')

const NyplStreamsClient = require('@nypl/nypl-streams-client')

const index = require('./index')
const ResourceSerializer = require('./es-serializer').ResourceSerializer

const OUTGOING_SCHEMA_NAME = process.env['OUTGOING_SCHEMA_NAME'] || 'IndexDocumentProcessed'
const OUTGOING_STREAM_NAME = process.env['OUTGOING_STREAM_NAME']

const DiscoveryStoreModels = require('discovery-store-models')
const { Bib } = DiscoveryStoreModels

function writeResourcesToIndex (resources) {
  log.debug('Saving batch of ' + resources.length + 'resources', resources)
  return index.resources.save(process.env['ELASTIC_RESOURCES_INDEX_NAME'], resources)
    .then((result) => {
      if (result && result.errors) return Promise.reject(new Error('Elastic reports errors: ' + result.errors + ': ' + JSON.stringify(result, null, 2)))
    })
    .then(() => resources)
}

function notifyIndexDocumentProcessed (resources) {
  if (!OUTGOING_STREAM_NAME) {
    log.warn('Attempting to notify IndexDocumentProcessed stream, but no stream configured')
    return Promise.resolve()
  }

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
 *  @property {integer} suppressedUris - Number suppressed (or not saved)
 *  @property {array<string>} savedUris - Array of uris (ids with prefixes)
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

  var suppressedUris = []
  let savedUris = []

  return stream
    // Suppress bibs that should be suppressed due to record suppression or to being non-research
    .map((record) => handleSuppression(record)
      .then((suppressed) => {
        if (suppressed) {
          // Keep track of suppressed uris:
          suppressedUris.push(record.uri)

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
          savedUris = savedUris.concat(resources.map((resource) => resource.uri))
        })
        .then(() => ({ count: resources.length }))
    })
    .flatMap((h) => _(h))
    // Count the number of successful indexings:
    .reduce(0, (total, result) => total + result.count)
    .map((savedCount) => {
      return {
        savedCount,
        savedUris,
        suppressedCount: suppressedUris.length,
        suppressedUris
      }
    })
}

// Given an array of uris (bnums), returns a Promise that resolves multiple raw results
function getResourceStatements (uris) {
  // Make sure it's an array:
  uris = Array.isArray(uris) ? uris : [uris]
  // Make sure none are repeated:
  uris = Object.keys(uris.reduce((h, uri) => {
    h[uri] = true
    return h
  }, {}))
  log.info('Fetching statements for ' + uris.join(', '))
  // Get bibs:
  return Bib.byIds(uris)
    .catch((e) => {
      // If it's just a bad bib id, quiet failure:
      if (e.name === 'QueryResultError') {
        log.info('Invalid bib ids: ' + uris + '. Moving on.')

        return []
      // Otherwise: throw error to stop all execution because it's probably not record specific:
      } else throw e
    })
}

/**
 * Process an array of bib ids. Retrieves objects from database, performs
 * suppressions and other deletions, updates documents in the index, and
 * notifies relevant streams.
 *
 * @param {array<string>} ids - Array of ids (e.g. ['b1234', 'b5678'])
 */
function processArrayOfBibUris (ids) {
  let result = {}

  // This call does all the work of suppressing/updating index using given stream of Bib instances
  // It returns a stream with one item giving stats
  return new Promise((resolve, reject) => {
    // index each document
    var stream = _(ids)
      // Flatten stream to array:
      .reduce([], (a, uri) => a.concat([uri]))
      // Look up statements by uri
      .map(getResourceStatements)
      .flatMap((h) => _(h))
      .map((bibs) => {
        // Now that we've fetched all retrievable records from the
        // store, identify records that were not retrieved from store
        // (either because they were deleted or never existed) and make sure
        // they do not exist in index:
        const validUris = bibs.map((bib) => bib.uri)
        const deleteUris = ids
          .filter((id) => validUris.indexOf(id) < 0)

        if (deleteUris.length > 0) {
          log.info(`Issuing DELETE on invalid bibids: ${deleteUris}`)
          result.deletedUris = deleteUris
          result.deletedCount = deleteUris.length

          return Promise.all(deleteUris.map((uri) => deleteResourceByUri(uri, { suppressErrors: true })))
            .then(() => bibs)
        }

        return Promise.resolve(bibs)
      })
      .flatMap((h) => _(h))
      // Now that we've the fetched bibs in a single array, feed them one by one into the stream:
      .sequence()
      // Strip missing (null) records
      .compact()

    processStreamOfBibs(stream)
      .map((_result) => {
        // Gather all aggregates together into a single object with:
        //  * savedUris, savedCount - Documents updated
        //  * suppressedUris, suppressedCount - Documents hidden because
        //      something in the bib/item data indicates it is "suppressed"
        //  * deletedUris, deletedCount - Documents deleted because they
        //      weren't retrievable from the store.
        result = Object.assign(result, _result)
      })
      .stopOnError((e) => {
        reject(e)
      })
      .done(() => {
        log.info('Completed processing ' + result.savedCount + ' doc(s)')
        if (result.suppressedCount) log.info('  Suppressed ' + result.suppressedCount + ' doc(s)')
        resolve(result)
      })
  })
}

module.exports = { processArrayOfBibUris, processStreamOfBibs, deleteResourceByUri }
