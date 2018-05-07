/**
 * Script to write bulk records into IndexDocumentQueue[-env]
 *
 * If you have a CSV of uris you'd like to reindex (because they're represented
 * well in the store, but are mis-represented in the ES index), this is the
 * script for you.
 *
 * Usage:
 *   node scripts/write-to-index-document-stream-from-file \
 *     --envfile config/qa.env --profile nypl-sandbox \
 *     [--infile [path to local 4-col csv]] \
 *     [--infileUriColumn N]
 *
 * @example
 * // This will read data from ./scripts/data/identify-ids-by-query-out.csv
 * // and write uris from col 3 (0 ind) to IndexDocumentQueue:
 * node scripts/write-to-index-document-stream-from-file --envfile config/qa.env --profile nypl-sandbox
 */

const fs = require('fs')
const minimist = require('minimist')
const NyplStreamsClient = require('@nypl/nypl-streams-client')
var log = require('loglevel')

const envConfigHelper = require('../lib/env-config-helper')

const argv = minimist(process.argv, {
  default: {
    streamName: 'IndexDocumentQueue',
    offset: 0,
    // CSV to read from:
    infile: './scripts/data/identify-ids-by-query-out.csv',
    // Column index (0-indexed) were we can find the "uri" value:
    infileUriColumn: 3
  }
})

const streamsClient = new NyplStreamsClient({ nyplDataApiClientBase: process.env['NYPL_API_BASE_URL'], logLevel: 'error' })

/**
 * Write {records} to {streamName} after encoding them against {schemaName}
 */
const writeToStreamsClient = (streamName, records, schemaName) => {
  return streamsClient.write(streamName, records, { avroSchemaName: schemaName })
    .then((response) => {
      if (response.FailedRecordCount > 0) {
        var responseRecords = response.Records
        var failedRecords = []
        for (var i = 0; i < responseRecords.length; i++) {
          if (responseRecords[i].ErrorCode) {
            failedRecords.push(records[i])
          }
        }
        return writeToStreamsClient(streamName, failedRecords, schemaName)
      }
      return Promise.resolve(response)
    })
    .catch((error) => {
      log.error('Error occurred while posting to kinesis')
      return Promise.reject(error)
    })
}

envConfigHelper.init({ })
  .then(() => {
    let records = fs.readFileSync(argv.infile, 'utf8')
      .split('\n')
      .map((row) => row.split(','))
      .map((row, ind) => {
        if (!row) throw new Error(`Failed at row ${ind}: Row empty/null: ${row}`)
        if (!row[argv.infileUriColumn]) throw new Error(`Failed at row ${ind}: Column index ${argv.infileUriColumn} empty/null: ${row[argv.infileUriColumn]}`)

        return { type: 'record', uri: row[argv.infileUriColumn] }
      })

    // Log what we're doing:
    console.log([
      'Processing',
      argv.limit ? ` ${argv.limit}` : ' ALL',
      ` of ${records.length} total records`,
      argv.offset ? ` starting at offset ${argv.offset}` : ''
    ].join(''))

    // Slice to specified range:
    if (argv.limit || argv.offset) records = records.slice(argv.offset, argv.offset + argv.limit || records.length)

    console.log(`Writing ${records.length} records to ${argv.streamName}`)
    return writeToStreamsClient(argv.streamName, records, 'IndexDocumentQueue')
      .then(() => {
        console.log(`Done writing ${records.length} to stream.`)
      })
  })
