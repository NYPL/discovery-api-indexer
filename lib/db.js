'use strict'

const log = require('loglevel')

var config = require('config')

var pgp = require('pg-promise')()
var db = pgp(config.get('pg.url'))

log

var QueryStream = require('pg-query-stream')
var JSONStream = require('JSONStream')
JSONStream

var stream = (query, values, options) => {
  var sql = pgp.as.format(query, values, options)
  var qs = new QueryStream(sql)

  return new Promise((resolve, reject) => {
    db.stream(qs, (s) => {
      resolve(s)
    })
  })
}

var resources = {
  stream: (query, options) => {
    var values = {}
    if (options.query) {
      query += ' ' + Object.keys(options.query).map((prop) => {
        return `${prop} = $(${prop})`
      }).join(' ')
      values = Object.keys(options.query).reduce((h, prop) => {
        h[prop] = options.query[prop]
        return h
      }, {})
    }
    // console.log('query, values: ', query, values)
    return stream(query, values) // , options)
  },

  bibs: (options) => {
    var query = `
       SELECT B.subject_id, (
          SELECT json_agg(json_build_object('pr', _BS.predicate, 'id', _BS.object_id, 'li', _BS.object_literal, 'la', _BS.object_label))::jsonb AS statements
          FROM resource_statement _BS
          WHERE _BS.subject_id=B.subject_id
  ) as bib_statements,
       (
         SELECT json_agg(json_build_object('s', _IS.subject_id, 'pr', _IS.predicate, 'id', _IS.object_id, 'li', _IS.object_literal, 'la', _IS.object_label))::jsonb AS statements
         FROM resource_statement _I
         INNER JOIN resource_statement _IS ON _IS.subject_id=_I.subject_id
         WHERE _I.predicate='nypl:bnum' AND _I.object_id = CONCAT('urn:bnum:', B.subject_id)
       ) AS item_statements
       FROM resource_statement B
  WHERE B.predicate='rdf:type' AND B.object_id = 'nypl:Bib'
       GROUP BY B.subject_id
       OFFSET ${options.offset}
       LIMIT ${options.limit}`
    return resources.stream(query, options)
  }
}

var getItemStatements = (bnum) => {
  return db.any([
    'SELECT * FROM resource_statement R',
    'WHERE R.subject_id IN (',
    'SELECT subject_id FROM resource_statement _R',
    'WHERE _R.predicate = \'dcterms:identifier\'',
    'AND _R.object_id = $(bnum)',
    ')'
  ].join(' '))
}

var getStatements = (tableName, subjectId) => {
  return db.any(`SELECT * FROM ${tableName} WHERE subject_id = $1`, [subjectId])
}

module.exports = { resources, getStatements, getItemStatements, stream }
