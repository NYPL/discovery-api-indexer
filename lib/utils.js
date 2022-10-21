const fs = require('fs')
const csv = require('fast-csv')
const fold = require('accent-fold')

exports.readCsv = (path) => {
  return new Promise((resolve, reject) => {
    const rows = []

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

exports.groupBy = (a, prop) => {
  const grouped = a.reduce((grouped, item) => {
    const val = item[prop]

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
  return componentSubjects.map((subject, i) => componentSubjects.slice(0, i + 1).join(' -- ').trim())
}

/**
 * Given a string, applies several transformations to make it suitable for title_sort:
 * - Replace / and - with a space (See Sec. 3.2 above) √
 * - Apply basic char folding so that accented characters are ordered where we’d expect (and not stripped by following rule)
 * - Strip anything matching /[^\w\s]/ (non characters/numbers/whitespace) from the whole string √
 * - Replace multiple contiguous whitespace characters with a single character. √
 * - Strip leading whitespace √
 * - Lowercase it √
 */
exports.titleSortTransform = function (string) {
  return fold(string)
    .replace(/[/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^\w\s]+/g, '')
    .toLowerCase()
}

/**
 *  Given an array, returns true if the array contains truthy values at some
 *  depth (up to given `maxDepth`).
 *
 *  E.g. these are valid for maxDepth 2:
 *   - [1, 2]
 *   - [[1, 2], [3, 4]]
 *   - [[1], 2]
 *
 *  These are invalid: for maxDepth 2:
 *   - []
 *   - [[]]
 *   - [[], []]
 *   - [[[3]]]
 */
exports.isArrayWithValues = function (a, maxDepth = 2, depth = 0) {
  if (depth >= maxDepth) return false

  return Array.isArray(a) &&
    a.length > 0 &&
    a.some((_a) => {
      return (!Array.isArray(_a) && typeof _a !== 'undefined') ||
        exports.isArrayWithValues(_a, maxDepth, depth + 1)
    })
}

/**
 * Given a string, returns a new string left-padded with the specified
 * character to the specified length
 */
exports.leftPad = function (s, padLen, padChar = '0') {
  s = s === null || (typeof s) === 'undefined' ? '' : String(s)
  return (new Array(Math.max(0, (padLen - s.length) + 1))).join(padChar) + s
}
