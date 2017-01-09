
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