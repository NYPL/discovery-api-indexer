'use strict'

var utils = require('./utils.js')
var db = require('./db')
var ProcessViz = require('./process-viz').ProcessViz

/*
 *  Simple interface for managing a number of concurrent worker threads
 *
 *  Usage:
 *    var runner = new IndexerRunner(INDEX_NAME, COLLECTION_NAME, QUERY, CLUSTER_REF, OPTS)
 *
 *  COLLECTION: String, name of mongodb collection
 *  QUERY : Hash, mongo query to run (i.g. {} indexes everything)
 *  CLUSTER_REF : Reference to `cluster` (i.e. `var cluster = require('cluster')`) created in worker script
 *  OPTS : Hash of options:
 *    botCount : Integer, number of concurrent threads to run, default 15
 *    useScreen : Bool, enables/disables fancy full-termainal graphics, default true
 */
class IndexerRunner {

  constructor (collection, query, cluster, options) {
    this.collection = collection
    this.query = query
    this.cluster = cluster

    this.options = Object.assign({
      botCount: 15,
      useScreen: true,
      onComplete: () => true,
      limit: null
    }, options)

    this.activeBots = 0
    this.totalProcessed = 0

    this.workerEventHandlers = []
  }

  getQueryCount (cb) {
    // find out how many resources there are total
    // db.connect().then((connection) => connection.collection(this.collection).count(this.query).then(cb))

    cb(this.options.limit)
    db
    // FIXME this is hardcoded for now until getting a distinct resources count isn't an expensive query..
    // cb(10191397)
  }

  log () {
    if (this.viz) this.viz.log(arguments[0])
  }

  run () {
    this.init()

    this.getQueryCount((count) => {
      this.viz.log('Running on query: ' + utils.hashToQueryString(this.query) + ' (' + count + ' records)')
      this.jobCount = count
      this.viz.setOverall('total', this.jobCount)

      // break up how much to work for each bot
      this.perBot = Math.ceil(this.jobCount / this.options.botCount)
      this.currentStart = 0

      this.seekDelay = 20
      this.maxConcurrentBots = 3

      this.viz.log('Running with ' + this.options.botCount + ' bot(s), ' + this.perBot + ' records/bot, ' + this.seekDelay + 's delay')

      this.buildWorker(0, this.perBot)
      if (this.options.botCount > 1) setTimeout(() => this.considerBuildingWorker(), this.seekDelay * 1000)
    })
  }

  considerBuildingWorker () {
    if (this.activeBots === this.maxConcurrentBots) {
      return setTimeout(() => this.considerBuildingWorker(), 3 * 1000)
    }

    this.currentStart += this.perBot

    var limit = Math.min(this.perBot, this.jobCount - this.currentStart)
    this.buildWorker(this.currentStart, limit)

    if (this.currentStart + this.perBot < this.jobCount) {
      setTimeout(() => this.considerBuildingWorker(), this.seekDelay * 1000)
    }
  }

  addWorkerEventHandler (name, handler) {
    if (!this.workerEventHandlers[name]) this.workerEventHandlers[name] = []
    this.workerEventHandlers[name].push(handler)
  }

  buildWorker (start, limit) {
    var worker = this.cluster.fork()

    worker.on('message', function (msg) {
      if (msg.start) {
        this.activeBots += 1
        this.viz.log('Worker ' + worker.id + ' start on ' + limit + ' item chunk starting at ' + start)
        this.viz.workerSet(worker.id, {completed: 0, total: limit, skipped: 0, status: 'seeking'})

        worker.send({ start: start, total: limit, query: this.query })
      }

      if (msg.totalUpdate) {
        this.viz.workerSet(worker.id, {status: 'building'})
        this.viz.workerIncrement(worker.id, 'completed', msg.totalUpdate)

        this.totalProcessed += parseInt(msg.totalUpdate)
        this.viz.setOverall('processed', this.totalProcessed)

        if (!this.options.useScreen && this.totalProcessed >= this.jobCount) {
          process.exit()
        }
      }

      if (msg.skipped) {
        this.viz.workerIncrement(worker.id, 'skipped', 1)
        this.totalProcessed += 1
      }

      Object.keys(this.workerEventHandlers).forEach((k) => {
        if (msg[k]) {
          this.workerEventHandlers[k].forEach((handler) => handler(msg))
        }
      })
    }.bind(this))
  }

  init () {
    this.viz = {
      log: console.log,
      workerSet: function () {},
      workerIncrement: function () {},
      setOverall: function () {}
    }

    if (this.options.useScreen) {
      this.viz = new ProcessViz()
    }

    this.cluster.on('disconnect', (worker, code, signal) => {
      var remaining = Object.keys(this.cluster.workers).length - 1
      this.viz.log(`${worker.id} finished. There are ${remaining} remaining bots`)

      this.viz.workerSet(worker.id, {status: 'done'})
      this.activeBots -= 1
      // if (remaining === 0 && totalProcessed >= jobCount) {
        // buildNext()
      // }
    })
  }
}

module.exports = IndexerRunner
