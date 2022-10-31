'use strict'

const blessed = require('blessed')
const contrib = require('blessed-contrib')

/*
 *  Simple interface full-terminal visualization of a multi-threaded indexing process
 *  See IndexRunner
 *  TODO Should really be an event listener interface rather than requiring direct hooks in processing script
 */
class ProcessViz {
  constructor () {
    this.screen = blessed.screen()

    const grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen }) // eslint-disable-line new-cap
    this.active_bots_table = grid.set(0, 0, 5, 8, contrib.table, { label: 'Worker Bots', keys: true, columnWidth: [4, 8, 8, 8, 4, 8] })
    this.progress_donut = grid.set(0, 8, 4, 4, contrib.donut, { label: 'Progress' }, { radius: 8 })
    this.velocity_chart = grid.set(8, 0, 4, 8, contrib.line, {
      label: 'Velocity',
      showLegend: true,
      legend: { width: 30 },
      maxY: 1500
    })
    this.message_log = grid.set(5, 0, 3, 8, contrib.log, { label: 'Messages' })
    this.stats_table = grid.set(4, 8, 2, 4, contrib.table, { label: 'Stats', columnWidth: [15, 15] })

    this.screen.key(['C-c'], function (ch, key) {
      return process.exit(0)
    })

    this.velocitySamples = []
    this.active_bots_data = {}

    this.jobCount = null

    this.totalProcessed = 0

    this._monitorVelocities()
    this._monitorEstimatedCompletion()
  }

  // Set global property
  setOverall (what, value) {
    switch (what) {
      case 'total':
        this.setJobCount(value)
        break
      case 'processed':
        this.notifyProcessed(value)
        break
    }
  }

  // Log a message
  log () {
    const message = Object.keys(arguments).map((k) => arguments[k])
    this.message_log.log(message.join(' '))
  }

  // Set arbitrary property/properties for the indicated worker
  // e.g.
  //   viz.workerSet(ID, {completed: 0, total: limit, skipped: 0, status: 'seeking'})
  workerSet (workerId, data) {
    this.active_bots_data[workerId] = Object.assign({}, this.active_bots_data[workerId], data)
    this.updateActiveBotsTable()
  }

  // Increment the worker property
  // e.g.
  //   viz.workerIncrement(ID, 'completed', 47)
  //   viz.workerIncrement(ID, 'skipped', 3)
  workerIncrement (workerId, property, count) {
    this.active_bots_data[workerId][property] += count
    this.updateActiveBotsTable()
  }

  // End public interface

  setJobCount (c) {
    this.jobCount = c
  }

  notifyProcessed (count) {
    this.totalProcessed = count
    const percent = count / this.jobCount
    this.progress_donut.setData([
      { percent, label: count + ' of ' + this.jobCount, color: 'green' }
    ])
    this.screen.render()
  }

  updateActiveBotsTable () {
    const data = Object.keys(this.active_bots_data).map((id) => {
      const bot = Object.assign({
        completed: 0,
        skipped: 0,
        total: 0,
        status: 'Starting'
      }, this.active_bots_data[id])
      const percent = bot.total > 0 ? Math.floor(100 * bot.completed / bot.total) + '%' : '-'
      return [id, bot.completed, bot.skipped, bot.total, percent, bot.status]
    })
    this.active_bots_table.setData({ headers: ['ID', 'Completed', 'Skipped', 'Total', '%', 'Status'], data })
    this.screen.render()
  }

  setStat (label, value) {
    if (!this._stats) this._stats = {}

    // Update named stat:
    this._stats[label] = value

    // Build array version of stats:
    const statsArray = Object.keys(this._stats).map((k) => {
      return [k, this._stats[k]]
    })

    this.stats_table.setData({ headers: ['Key', 'Value'], data: statsArray })
  }

  _monitorVelocities () {
    this.startTime = (new Date()).getTime() / 1000
    this.overallVelocitySamples = []
    this.sampleVelocitySamples = []
    const updateVelocities = () => {
      const ellapsed = ((new Date()).getTime() / 1000) - this.startTime
      this.overallV = this.totalProcessed / ellapsed
      const sampleSize = 10 // seconds
      const sampleV = this.velocitySamples.slice(this.velocitySamples.length - sampleSize).reduce(function (sum, v) { sum += v; return sum }) / sampleSize
      this.overallVelocitySamples.push(this.overallV)

      const numSamples = 180
      if (this.overallVelocitySamples.length > numSamples) this.overallVelocitySamples.shift()
      this.sampleVelocitySamples.push(sampleV)
      if (this.sampleVelocitySamples.length > numSamples) this.sampleVelocitySamples.shift()
      const xLabels = []
      for (let i = 0; i < numSamples; i++) xLabels.push('-' + (numSamples - i) + 's')
      const zeroFill = this.overallVelocitySamples.length < 0 ? [] : Array(numSamples - this.overallVelocitySamples.length).fill(0)
      const sampleData = zeroFill.concat(this.sampleVelocitySamples)
      const overallData = zeroFill.concat(this.overallVelocitySamples)
      this.velocity_chart.setData([
        { title: '10s Sample V: ' + Math.round(sampleV) + '/s', x: xLabels, y: sampleData, style: { line: 'green' } },
        { title: 'Overall V: ' + Math.round(this.overallV) + '/s', x: xLabels, y: overallData, style: { line: 'red' } }
      ])
    }
    let velocityPreviousTotal = 0
    setInterval(() => {
      const speed = this.totalProcessed - velocityPreviousTotal
      this.velocitySamples.push(speed)
      velocityPreviousTotal = this.totalProcessed
      updateVelocities()
    }, 1000)
  }

  _monitorEstimatedCompletion () {
    const _monitor = () => {
      if (!this.jobCount) return

      const estimatedCompletion = Math.round((this.jobCount - this.totalProcessed) / this.overallV)
      let displayEta = estimatedCompletion
      let unit = 's'
      const unitReductions = { d: 3600 * 24, h: 3600, m: 60 }
      for (const _unit in unitReductions) {
        const threshold = unitReductions[_unit]
        if (estimatedCompletion > threshold) {
          unit = _unit
          displayEta = Math.round(estimatedCompletion / threshold)
          break
        }
      }
      this.setStat('Remaining', displayEta + unit)
    }

    setInterval(_monitor, 2000)
  }
}

module.exports.ProcessViz = ProcessViz
