const path = require('path')
const fs = require('fs')
const dotenv = require('dotenv')

const Bib = require('../lib/models/bib')
const kmsHelper = require('../lib/kms-helper')
const db = require('../lib/db')

var argv = require('optimist')
  .argv

function bibFixturePath (id) {
  return path.join(__dirname, `../test/data/${id}.json`)
}

function dbConnect () {
  if (db.connected()) return Promise.resolve()
  else {
    return kmsHelper.decryptDbCreds()
      .then((uri) => db.setConnection(uri))
  }
}

/*
 * Fetch a single bib from db and write to fixtures dir
 */
function updateBib (id) {
  return Bib.byId(id).then((bib) => {
    fs.writeFileSync(bibFixturePath(id), JSON.stringify(bib, null, 2))
    return Promise.resolve(path)
  })
}

/*
 * Re-fetch all previously saved bibs from db
 */
function updateAllBibs () {
  return new Promise((resolve, reject) => {
    fs.readdir(path.join('test/data'), (err, paths) => {
      if (err) console.error(err)

      let bibIds = paths
        .filter((path) => /(\w+).json/.test(path))
        .map((path) => path.match(/(\w+).json/)[1])

      resolve(Promise.all(bibIds.map((id) => updateBib(id))))
    })
  })
}

// TODO Config is in flux; These need to point to whatever env files hold AWS creds and db connection string
// Load a .env file with db creds:
dotenv.config({ path: './bak/.env' })
dotenv.config({ path: argv.envfile })

/*
 *  Tool for updating fixtures on disk with whatever's presently in db.
 *
 *  Useage:
 *
 *  This will update all fixtures against configured db:
 *    node jobs/update-test-fixtures
 *
 *  This will update a single fixture by [bib] id:
 *
 *    node jobs/update-test-fixtures --id [ID]
 *
 *  For example, this updates bib 'b10781594'
 *    node jobs/update-test-fixtures --id b10781594
 */
dbConnect().then(() => {
  if (argv.id) {
    updateBib(argv.id).then(() => {
      console.log('Finished updating ' + argv.id)
      process.exit()
    })
  } else {
    updateAllBibs().then((paths) => {
      console.log(`Finished updating ${paths.length} bib fixtures`)
      process.exit()
    })
  }
})
