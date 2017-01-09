'use strict'

const IndexerRunner = require('../lib/indexer-runner')
const ResourceSerializer = require('../lib/es-serializer').ResourceSerializer
const db = require('../lib/db')
const index = require('../lib/index')

var cluster = require('cluster')

var VALID_TYPES = ['all', 'collection', 'component', 'item']

// Parsc cmd line opts:
var argv = require('optimist')
  .usage('Index resources index with various types\nUsage: $0 -type TYPE')
  // .demand('type')
  .describe('type', 'Specify type to index (' + VALID_TYPES.join(', ') + ')')
  .default('uri', null)
  .describe('uri', 'Specify single uri to inex')
  .boolean(['disablescreen', 'rebuild', 'debug'])
  .describe('disablescreen', 'If set, output printed to stdout rather than taking over screen with fancy visuals')
  .describe('rebuild', 'If set, all data in index deleted and new schema applied')
  .describe('debug', 'Print debug info')
  .argv

// TODO Need to resolve whether or not to index resources according to their domain type: collection, container, item, capture
// For now, not doing this. Seems to add more trouble than benefit atm
// This flag controls a couple local decision points,
// but making it `true` will not necessarily fully enable it
var INDEX_DISTINCT_RESOURCE_TYPES = false
if (INDEX_DISTINCT_RESOURCE_TYPES && VALID_TYPES.indexOf(argv.type) < 0) {
  console.log('Invalid type. Should be one of: ' + VALID_TYPES.join(', '))
  process.exit()
}

var attachItems = (bib) => {
  if (!bib) return Promise.resolve(bib)

  // console.log('looking up items for bib: ', bib.uri)
  return db.resources().then((resources) => {
    return resources.find({'rdf:type': 'nypl:Item', 'dcterms:identifier.objectUri': `urn:bnum:${bib.uri}`}).limit(100).toArray().then((items) => {
      // console.log('found? ', items)
      bib._items = items.map(db.TriplesDoc.from)
      return bib
    })
  })
}

// Index single item by uri:
if (argv.uri) {
  console.log('uri: ', argv.uri)
  db.resources.findOne({ uri: `${argv.uri}` }).then(attachItems).then((resource) => {
    ResourceSerializer.serialize(resource).then((record) => {
      console.log('Extract index fields for resource:')
      console.log(JSON.stringify(resource, null, 2))
      console.log('________________')
      console.log(JSON.stringify(record, null, 2))

      return index.resources.save([record]).then((res) => {
        console.log('Done saving', JSON.stringify(res, null, 2))
        process.exit()
      })
    }, (err) => console.error('Error serializing: ', err))
  }, (err) => console.error('Error retrieving: ', err))

// Master script:
} else if (cluster.isMaster) {
  var useScreen = !argv.disablescreen
  var rebuild = argv.rebuild

  var buildByQuery = function (query) {
    var runner = new IndexerRunner('resources', query, cluster, {
      botCount: 5,
      useScreen: useScreen
    })
    runner.run()
  }

  var tasks = []
  // tasks.push(function () { buildByQuery({'rdf:type': 'nypl:Bib'}) })
  tasks.push(function () { buildByQuery({}) })
  // tasks.push(function () { buildByQuery({'rdf:type': 'nypl:Item'}) })

  var buildNext = function () {
    if (tasks.length > 0) tasks.shift()()
  }

  if (rebuild) index.resources.prepare().then(() => buildNext())
  else buildNext()

// Worker script:
} else {
  var _ = require('highland')

  // ask for where to start
  process.send({ start: true })

  process.on('message', (msg) => {
    if (typeof msg.start !== 'number') return

    // db.resources().then((resources) => {
      // _(resourcesCollection.find(msg.query).skip(parseInt(msg.start)).limit(msg.total).batchSize(msg.total).stream())
      // var stream = _(resources.find(msg.query).skip(parseInt(msg.start)).limit(msg.total).batchSize(msg.total).stream())

    db.resources.bibs({ query: msg.query, offset: msg.start, limit: msg.total }).then((stream) => {
      _(stream)
        .map((rec) => {
          var doc = ResourceSerializer.fromStatements(rec).then((serialized) => {
            // console.log('got serialized: ', serialized)
            return serialized
          })
          return doc
          // console.log('stmts: ', JSON.stringify(rec, null, 2))
          /* var bnum = rec.filter((s) => s.predicate === 'dcterms:identifier' && s.object_id.match(/urn:bnum:/))[0]
          if (bnum) {
            return db.getItemStatements(bnum.object_id).then((itemStatements) => {
              console.log('got item statements: ', itemStatements)
              return rec
            })
          } else {
            return Promise.resolve(rec)
          }
          */
        })
        .flatMap((p) => _(p))
        .stopOnError((e) => {
          console.error('error: ', e, e.stack)
        })
        .map((rec) => {
          // console.log('Save Doc: ', JSON.stringify(rec, null, 2))
          return rec
        })
        .map((resp) => {
          process.send({ totalUpdate: 1 })
        })
        .done((s) => console.log('done? ', s))
    }).catch((e) => {
      console.log('error', e)
      console.trace(e)
    })

    // stream

    /*
     *  stream
      .map(db.TriplesDoc.from)
      .map(attachItems)
      .filter((bib) => {
        // Filter out anything that's not research
        var items = bib._items || []
        var researchItems = items.filter((item) => item['nypl:itemType.objectUri'].filter((type) => type === 'urn:itemtype:research') > 0)
        // Must either have 0 items, or at least one research item:
        var valid = items.length === 0 || researchItems.length > 0
        if (items.length > 0) console.log('valid? ', items.length, researchItems.length, valid)
        return valid
      })
      .flatMap((promise) => _(promise))
      .map(ResourceSerializer.serialize)
      .flatMap((promise) => _(promise))
      .map((serialized) => {
        // if (true) console.log('Serialized: ', JSON.stringify(serialized, null, 2))
        return serialized
      })
      .filter((resource) => resource.uri)
      .stopOnError((e) => {
        console.log('Error with: ', e)
        process.exit()
      })

    stream.batchWithTimeOrCount(100, 100)
      // .map((recs) => index.resources.save(recs, msg.query['rdf:type'] === 'nypl:Item'))
      .map((recs) => index.resources.save(recs))
      .flatMap((promise) => {
        // console.log('got: ', promise)
        return _(promise)
      })             // Resolve mongo insert promises
      .stopOnError((e) => {                         // Check for mongo errors
        console.error('Error saving:', e)
        console.trace('  Error:', e)
        process.exit()
      })
      .map((resp) => {
        process.send({ totalUpdate: resp.items.length })
      })
      .done(function (err) {
        if (err) console.info(err)
        // console.log(`Done updating resources (${offset}, ${limit})`)
        process.exit()
      })
    // })

    */
  })
}

