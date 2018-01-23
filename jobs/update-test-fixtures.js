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
 *    node jobs/update-test-fixtures --id [ID] --profile [aws profile] --envfile [path to ENV file with db creds]
 *
 *  For example, this updates fixture for 'b10781594' using qa creds
 *    node jobs/update-test-fixtures --id b10781594 --profile nypl-sandbox --envfile config/qa.env
 */

const path = require('path')
const fs = require('fs')

const Bib = require('../lib/models/bib')
const db = require('../lib/db')
const envConfigHelper = require('../lib/env-config-helper')

var argv = require('optimist')
  .argv

function bibFixturePath (id) {
  return path.join(__dirname, `../test/data/${id}.json`)
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

// Initialize db connection based on --envfile and --profile:
envConfigHelper.init({ db }).then((opts) => {
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
