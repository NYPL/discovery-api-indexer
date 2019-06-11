
const fs = require('fs')
const csv = require('fast-csv')

exports.readCsv = (path) => {
  return new Promise((resolve, reject) => {
    var rows = []

    fs.createReadStream(path)
      .pipe(csv())
      .on('data', (data) => {
        rows.push(data)
      })
      .on('end', () => {
        resolve(rows)
      })
  })
}

exports.hashToQueryString = function (obj, prefix) {
  var str = []
  for (var p in obj) {
    if (obj.hasOwnProperty(p)) {
      var k = prefix ? prefix + '[' + p + ']' : p
      var v = obj[p]
      str.push(typeof v === 'object' ? exports.hashToQueryString(v, k) : encodeURIComponent(k) + '=' + encodeURIComponent(v))
    }
  }
  return str.join('&')
}

exports.groupBy = (a, prop) => {
  var grouped = a.reduce((grouped, item) => {
    var val = item[prop]

    if (!grouped[val]) grouped[val] = []
    grouped[val].push(item)

    return grouped
  }, {})

  return Object.keys(grouped).map((v) => grouped[v])
}

/**
 * Given a plainobject and a callback function
 * returns a new object consisting of those keys
 * that the callback returned `true` for (deep recursively).
 */
exports.deepFilterByKey = function (obj, cb) {
  if (typeof obj !== 'object') return obj

  return Object.keys(obj).reduce((clean, key) => {
    const value = obj[key]
    if (cb(key, value)) clean[key] = exports.deepFilterByKey(obj[key], cb)
    return clean
  }, {})
}

/**
 * Given a triple returns a collection of all subjects that occur as initial ' -- '-delimited substrings of the subject
 * recorded in the triple's object_literal property
 */
exports.explodedSubjectLiterals = function (triple) {
  const subject = triple.object_literal.slice(-1) === '.' ? triple.object_literal.slice(0, -1) : triple.object_literal
  const componentSubjects = subject.split(' -- ')
  return componentSubjects.map((subject, i) => componentSubjects.slice(0, i + 1).join(' -- ').trimRight())
}
