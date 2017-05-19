'use strict'

const index = require('../lib/index')

// Parsc cmd line opts:
var argv = require('optimist')
  .usage('Index Administration\nUsage: $0 COMMAND')
  .boolean('force')
  .argv

var command = argv._[0]

const validCommands = ['list', 'activate', 'delete', 'prepare']
if (validCommands.indexOf(command) < 0) console.error('Specify command: ' + validCommands.join(', '))

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
}

