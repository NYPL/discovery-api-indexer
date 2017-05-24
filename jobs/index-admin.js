'use strict'

const envConfigHelper = require('../lib/env-config-helper')
const index = require('../lib/index')

// Parsc cmd line opts:
var argv = require('optimist')
  .usage('Index Administration\nUsage: $0 COMMAND')
  .boolean('force')
  .argv

var command = argv._[0]

const validCommands = ['list', 'activate', 'delete', 'prepare', 'reindex', 'check']
if (validCommands.indexOf(command) < 0) console.error('Specify command: ' + validCommands.join(', '))

// Initialize connections
envConfigHelper.init({ index }).then((opts) => {
  // List indexes (with aliases)
  // e.g. `node jobs/index-admin list`
  if (command === 'list') {
    index.admin.list().then((indexes) => {
      console.info('Indexes: ')
      indexes.forEach((ind) => {
        console.info('  ' + ind.index + (ind.aliases.length > 0 ? ' > ' : '') + ind.aliases.map((a) => `"${a}"`).join(', ') + ' (' + ind.count + ' records)')
      })
    }).catch((e) => console.error(e.message, e.stack))

  // Activate an index via `activate --index [datestamped-index-name]`
  // e.g. To create an alias called 'resources' pointing to index 'resources-2017-01-09', run:
  //      `node jobs/index-admin activate --index resources-2017-01-09`
  } else if (command === 'activate') {
    if (!argv.index || !argv.index.match(/-*/)) throw new Error('Invalid index given')

    var alias = argv.index.replace(/-.*/, '')
    console.info('Activating "' + argv.index + '" by assigning it alias "' + alias + '"...')
    index.admin.setAlias({ index: argv.index, alias, force: argv.force }).then((success) => {
      if (success) console.log('Activated alias.')
    }).catch((e) => console.error(e.message))

  // Delete
  } else if (command === 'delete') {
    if (argv.confirm === argv.index) {
      index.admin.deleteIndex(argv.index).then(() => console.log('Deleted "' + argv.index + '"'))
        .catch((e) => console.error(e.message, e.stack))
    } else console.error('To delete an index, add --confirm [indexname]')

  // Prepare
  } else if (command === 'prepare') {
    if (!argv.index || !argv.index.match(/-*/)) throw new Error('Invalid index given')

    index.resources.prepare(argv.index, false)
      .then((res) => {
        console.log('Created ' + argv.index)
      })
      .catch((e) => {
        console.error('Error: ', e)
      })

  // Check config (print main vars to stdout for verification)
  } else if (command === 'check') {
    envConfigHelper.getConfig().then((c) => {
      console.log('Config check:\n', JSON.stringify(c, null, 2))
    })

  // Reindex
  // NOTE: This should work in principle but AWS doesn't support it cross hosts
  } else if (command === 'reindex') {
    if (!argv.source) throw new Error('Invalid source given')
    if (!argv.dest) throw new Error('Invalid dest given')

    index.resources.reindex(argv.source, argv.dest)
      .then((res) => {
        console.log('Reindexing ' + argv.source + ' to ' + argv.dest)
        console.log('Resp: ', JSON.stringify(res, null, 2))
      })
      .catch((e) => {
        console.error('Error: ', e)
      })
  }
})
