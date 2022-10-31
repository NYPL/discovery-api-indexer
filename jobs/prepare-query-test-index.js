const highland = require('highland')
const fs = require('fs')

const DiscoveryStoreModels = require('discovery-store-models')
const { Bib } = DiscoveryStoreModels

const envConfigHelper = require('../lib/env-config-helper')
const index = require('../lib/index')
const resourcesIndexer = require('../lib/resource-indexer')

/**
 * Get Promise resolving array of bib paths
 */
function fixturePaths () {
  return new Promise((resolve, reject) => {
    fs.readdir('./test/data', (err, files) => {
      if (err) return reject(err)

      return resolve(
        files
          .filter((filename) => /\.json$/.test(filename))
          .map((filename) => `./test/data/${filename}`)
      )
    })
  })
}

/**
 * Get Promise resolving all Bib instances from test/data directory
 */
function fixtures () {
  return fixturePaths().then((paths) => {
    return Promise.all(
      paths.map((path) => {
        return new Promise((resolve, reject) => {
          fs.readFile(path, 'utf8', (err, content) => {
            if (err) return reject(err)

            const data = JSON.parse(content)
            const bib = Bib.fromDbJsonResult(data)
            return resolve(bib)
          })
        })
      })
    )
  })
}

const prepareIndex = () => {
  process.env.ELASTIC_RESOURCES_INDEX_NAME = 'resources-test-index'

  return index.resources.prepare(process.env.ELASTIC_RESOURCES_INDEX_NAME, true).then((resp) => {
    console.log('Created ' + process.env.ELASTIC_RESOURCES_INDEX_NAME)
    return resp
  })
}

const seedIndex = () => {
  return fixtures().then((bibs) => {
    console.log(`Seeding ${process.env.ELASTIC_RESOURCES_INDEX_NAME} with ${bibs.length} bibs`)

    const streamOfBibs = highland(bibs)

    resourcesIndexer.processStreamOfBibs(streamOfBibs, {
      notifyDocumentProcessed: false
    })
      .map((counts) => {
        console.log(`Saved ${counts.savedCount}, suppressed ${counts.suppressedCount} to ${process.env.ELASTIC_RESOURCES_INDEX_NAME}`)
        return null
      })
      .stopOnError((e) => {
        console.log('Error: ', e)
      })
      .done(() => {
        console.log('Done.')
      })
  })
}

// Initialize connections
envConfigHelper.init({ index }).then((opts) => {
  prepareIndex().then(() => {
    seedIndex().then(() => {
      console.log('all done')
    })
  })
    .catch((e) => {
      console.error('Error: ', e)
    })
})
