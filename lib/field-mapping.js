'use strict'

const readCsv = require('./utils').readCsv

var _cache = {}

class FieldMapping {

  constructor (data) {
    this.data = data
  }

  specFor (field) {
    var rows = this.data.filter((row) => this.__parse(row).name === field)
    if (rows.length === 0) return null
    if (rows.length > 1) return null
    return this.__parse(rows[0])
  }

  predicateFor (field) {
    var spec = this.specFor(field)
    return spec.predicate
  }

  all () {
    return this.data.map((row) => this.__parse(row))
  }

  byName (names) {
    return this.data.map((row) => this.__parse(row)).filter((spec) => names.indexOf(spec.name) >= 0)
  }

  __parse (row) {
    var jsonldKey = row[2] || row[1].split(':')[1]

    return {
      name: row[0],
      predicate: row[1],
      jsonldKey,
      range: row[5]
    }
  }
}

FieldMapping.initialize = (type) => {
  if (_cache[type]) return Promise.resolve(_cache[type])

  var path = './data/field-mapping-' + type + '.csv'
  return readCsv(path).then((rows) => {
    // Remove CLASSES rows
    while (rows.shift()) {
      if (rows[0][0] === 'Discovery property') {
        rows.shift()
        break
      }
    }
    var mapping = new FieldMapping(rows)
    _cache[type] = mapping
    return mapping
  })
}

module.exports = { FieldMapping }
