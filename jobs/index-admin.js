'use strict'

const envConfigHelper = require('../lib/env-config-helper')
const index = require('../lib/index')

// Parsc cmd line opts:
const argv = require('optimist')
  .usage('Index Administration\nUsage: $0 COMMAND')
  .boolean('force')
  .argv

const command = argv._[0]

const validCommands = ['list', 'activate', 'delete', 'prepare', 'reindex', 'reindex-status', 'check', 'mapping-check']
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

    const alias = argv.index.replace(/-.*/, '')
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

  // Check mappings of index against what's configured
  } else if (command === 'mapping-check') {
    // Helper method for printing out a sub-report on mappings differnces:
    const reportOn = function (heading, instances) {
      console.log('######################################################')
      console.log(`${heading}: `)
      if (instances.length === 0) console.log('None')
      else {
        instances.forEach((prop) => {
          console.log('......................................................')
          console.log(`Property: ${prop.property}`)
          if (prop.local) console.log('  Local config:\n    ' + JSON.stringify(prop.local, null, 2).replace(/\n/g, '\n    '))
          if (prop.remote) console.log('  Remote (active) mapping:\n    ' + JSON.stringify(prop.remote, null, 2).replace(/\n/g, '\n    '))
        })
      }
    }

    const buildPutMapping = function (mappings) {
      return {
        properties: mappings.reduce((h, prop) => {
          h[prop.property] = prop.local
          return h
        }, {})
      }
    }

    index.resources.mappingCheck(argv.index || process.env.ELASTIC_RESOURCES_INDEX_NAME)
      .then((mapping) => {
        // List differences:
        reportOn('Mis-mapped Properties', mapping.unequalMappings)
        reportOn('Remote-only Properties', mapping.remoteOnlyMappings)
        reportOn('Missing (local-only) Properties', mapping.localOnlyMappings)

        // Generate a sample PUT body to push local-only mappings to remote:
        if (mapping.localOnlyMappings.length > 0) {
          const putBody = buildPutMapping(mapping.localOnlyMappings)
          console.log('......................................................')
          console.log('To add missing mappings: PUT the following to the index:', JSON.stringify(putBody, null, 2))
        }

        // Object type differences:
        // Generate a sample PUT body to push object-type mappings differences to remote:
        const patchableObjectTypeMappings = mapping.unequalMappings
          .filter((diff) => {
            const localIsObject = diff.local.type === 'object' || (diff.local.type !== 'object' && diff.local.properties)
            const remoteIsObject = diff.remote.type === 'object' || (diff.remote.type !== 'object' && diff.remote.properties)
            return localIsObject && remoteIsObject
          })
        if (patchableObjectTypeMappings.length > 0) {
          const putBody = buildPutMapping(patchableObjectTypeMappings)
          console.log('......................................................')
          console.log('Object type mappings are fixable via PUT *if* diff.s are addititive.')
          console.log('To add new object properties you may be able to PUT the following to the index:', JSON.stringify(putBody, null, 2))
        }
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

  // Reindex status
  // Prints various derived stats about the current reindex task
  } else if (command === 'reindex-status') {
    index.resources.reindexStatus()
      .then((res) => {
        console.log([
          `Showing progress of reindex task: \n  ${res.uri}`,
          `Completed: ${res.completed}`,
          `Remaining: ${res.remaining}`,
          `Records/s: ${res.recordsPerSecond}`,
          `Estimated completion: ${res.estimatedCompletionString}`,
          `Progress: ${res.progressString}`
        ].join('\n'))
      })
      .catch((e) => {
        console.error('Error: ', e)
      })
  }
})
