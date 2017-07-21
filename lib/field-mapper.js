const syncRequest = require('sync-request')

let _file_cache = {}

class FieldMapper {
  constructor (type, data) {
    this.type = type
    this.data = data
  }

  specFor (field, cb) {
    if (Object.keys(this.data).indexOf(field) < 0) throw new Error('Invalid ' + this.type + ' field: ' + field + ': ' + Object.keys(this.data))

    if (cb) {
      cb(this.data[field])
    }
    return this.data[field]
  }

  predicateFor (field) {
    var spec = this.specFor(field)
    return spec.pred
  }
}

// Syncronously fetch url, caching it for subsequent "requires"
function requireRemote (url) {
  if (!_file_cache[url]) {
    let res = syncRequest('GET', url)
    _file_cache[url] = JSON.parse(res.getBody('utf8'))
  }
  return _file_cache[url]
}

/**
 * Usage:
 *
 * To get a bib fieldmapper:
 *   const bibFieldMapper = require('./field-mapper')('bib')
 * To get an item fieldmapper:
 *   const itemFieldMapper = require('./field-mapper')('item')
 */
module.exports = function (type) {
  if (['bib', 'item'].indexOf(type) >= 0) {
    let data = requireRemote(`https://raw.githubusercontent.com/NYPL/nypl-core/master/mappings/recap-discovery/field-mapping-${type}.json`)
    return new FieldMapper(type, data)
  } else throw new Error('Unrecognized field-mapper type: ' + type)
}
