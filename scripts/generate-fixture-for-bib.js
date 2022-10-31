/**
 *
 * Generate a fixture for named bib.
 *
 * Usage:
 *
 *   node scripts/generate-fixture-for-bib --envfile [env file containing config] --uri [URI of bib]
 *
 * */

const log = require('loglevel')
const NyplSourceMapper = require('discovery-store-models/lib/nypl-source-mapper')
const platformApi = require('discovery-hybrid-indexer/lib/platform-api')
const discoveryStoreModel = require('discovery-hybrid-indexer/lib/discovery-store-model')
const fs = require('fs')

const argv = require('minimist')(process.argv.slice(2), {
  default: {}
})

// Load up AWS creds:
require('../lib/env-config-helper').init()

// Preflight check for necessary config:
; ['NYPL_OAUTH_KEY', 'SCSB_URL', 'SCSB_API_KEY'].forEach((prop) => {
  if (!process.env[prop]) {
    console.log(`Missing ${prop}`)
    process.exit()
  }
})

log.setLevel(argv.loglevel || process.env.LOGLEVEL || 'info')

/**
 *
 * Given a [Statement](https://github.com/NYPL-discovery/discovery-store-poster/blob/master/lib/models/statement.js)
 * returns a plain object emulating how that statement would have been extracted from the legacy database.
 */
const fixturifyStatement = (statement) => {
  return {
    s: statement.subject_id,
    pr: statement.predicate,
    index: statement.index,
    id: statement.object_id,
    ty: statement.object_type,
    li: statement.object_literal,
    la: statement.object_label,
    bn: statement.blanknode
      ? statement.blanknode._statements.map(fixturifyStatement)
      : null
  }
}

/**
 * Fetch bib (and items and holdings) by id and convert to a tree of
 * statements based on discovery-store-poster extraction rules
 */
const buildBib = async (nyplSource, bibId) => {
  const bib = await platformApi.bibById(nyplSource, bibId)

  console.log('Building DiscoveryStoreBib')
  const discoveryStoreBibs = await discoveryStoreModel.buildDiscoveryStoreBibs([bib])
  console.log('Built DiscoveryStoreBib')
  return discoveryStoreBibs[0]
}

/**
 * Given a DiscoveryStoreBib wrapping RDF statements for the bib and its children,
 * returns a JSON serialization of the object structured to emulate how
 * that bib would have been extracted from the discovery-store database.
 * The JSON is suitable for storing as a fixture in test/data
 */
async function fixtureForBib (bib) {
  const fixture = {
    subject_id: bib.uri,

    bib_statements: bib._statements.map(fixturifyStatement),

    item_statements: bib._items
      .map((i) => i._statements)
      .flat()
      .map(fixturifyStatement),

    holding_statements: bib._holdings
      .map((h) => h._statements)
      .flat()
      .map(fixturifyStatement)
  }

  return fixture
}

/**
 * Given a bib uri (e.g. b1234) builds a fixture and writes it to test/data/*.json
 */
async function writeFixture (uri) {
  const { nyplSource, id } = NyplSourceMapper.instance()
    .splitIdentifier(uri)

  const bib = await buildBib(nyplSource, id)
  const fixture = await fixtureForBib(bib)

  const path = `./test/data/${uri}.json`
  console.log(`Writing bib with ${bib._items.length} item(s) and ${bib._holdings.length} holding(s) to ${path}`)
  fs.writeFileSync(path, JSON.stringify(fixture, null, 2))
}

if (argv.uri) {
  writeFixture(argv.uri)
}
