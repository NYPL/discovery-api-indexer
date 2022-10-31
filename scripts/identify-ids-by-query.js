/**
 * This script takes a query (sample below) and collects all matching ids.
 * The result is written to ./data/identify-ids-by-query-out.csv
 *
 * Usage:
 *  - Modify the ES Query below
 *  - Run node scripts/identify-ids-by-query --profile [aws profile] --envfile [env file with relevant creds]
 *  - Check scripts/data/identify-ids-by-query-out.json for result
 */

const fs = require('fs')
const index = require('../lib/index')
const envConfigHelper = require('../lib/env-config-helper')

const PER_PAGE = 500

/**
 * ES Query:
 * This query will be used to identify records:
 */
const params = {
  body: {
    query: {
      nested: {
        path: 'items',
        query: {
          regexp: {
            'items.identifier': {
              value: '[0-9]+'
            }
          }
        }
      }
    },
    sort: ['uri'],
    size: PER_PAGE,
    _source: false
  }
}

/**
 * Recursive step. Given a raw search result, calls `scroll` until all records
 * consumed.
 *
 * @returns {Promise<String[]>} Promise that resolves an array of matching ids.
 */
function parseResultAndScroll (result, records = []) {
  const ids = result.hits.hits.map((h) => h._id)
  records = records.concat(ids)

  if (records.length < result.hits.total) {
    const page = Math.ceil(records.length / PER_PAGE)
    const pages = Math.ceil(result.hits.total / PER_PAGE)
    console.log(`Scrolling: ${page} of ${pages}`)
    return index.scroll({ scrollId: result._scroll_id, scroll: '30s' })
      .then((result) => parseResultAndScroll(result, records))
  } else {
    return records
  }
}

/**
 * Given an ES query, performs query, returning ids
 *
 * @returns {Promise<String[]>} Promise that resolves an array of matching ids.
 */
function fetch (params, records = []) {
  return index.search(params)
    .then(parseResultAndScroll)
}

envConfigHelper.init({ index })
  .then(() => {
    params.index = process.env.ELASTIC_RESOURCES_INDEX_NAME
    params.scroll = '30s'

    fetch(params).then((result) => {
      // Write to a CSV with four cols:
      //  - type (bib/item)
      //  - nyplSource (e.g. sierra-nypl, recap-pul)
      //  - id (e.g. 100)
      //  - uri (e.g. b100)
      const outpath = './scripts/data/identify-ids-by-query-out.csv'
      console.log(`Got ${result.length} results. Writing to ${outpath}`)

      // Map to nyplSource and numeric id:
      result = result.map((uri) => {
        const idParts = uri.match(/([bpc]{1,2})(\d+)/)
        const nyplSource = {
          b: 'sierra-nypl',
          pb: 'recap-pul',
          cb: 'recap-cul'
        }[idParts[1]]
        const id = idParts[2]
        return ['bib', nyplSource, id, uri]
      })

      fs.writeFileSync(outpath, result.join('\n'))
    })
  })
