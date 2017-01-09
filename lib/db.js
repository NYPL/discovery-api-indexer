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
  // console.log('test: ', pgp.as.format('SELECT * FROM resource_statement WHERE uri=$(uri)', { uri: 123 }))
  var sql = pgp.as.format(query, values, options)
  // console.log('sql: ', sql)
  var qs = new QueryStream(sql)

  // return Promise.resolve('what')
  return new Promise((resolve, reject) => {
    db.stream(qs, (s) => {
      // console.log('here', s) // .isPaused())
      // initiate streaming into the console:
      // s.pipe(JSONStream.stringify()).pipe(process.stdout)
      resolve(s) // .resume()
    })
  })
  /*
  .then((s) => {
    console.log('stream: ', s)
    return s
  })
  .catch((e) => console.error(e))
  .then((data) => {
    console.log('Total rows processed:', data.processed, 'Duration in milliseconds:', data.duration)
  })
  .catch(function (error) {
    console.log('ERROR:', error.message || error)
  })
  */
}

var resources = {
  stream: (query, options) => {
    // var query = 'SELECT * FROM resource_statement'
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
         SELECT json_agg(json_build_object('s', _I.subject_id, 'pr', _I.predicate, 'id', _I.object_id, 'li', _I.object_literal, 'la', _I.object_label))::jsonb AS statements
         FROM resource_statement _I
         INNER JOIN resource_statement _IS ON _IS.subject_id=_I.subject_id
         WHERE _I.predicate='nypl:bnum' AND _I.object_id = CONCAT('urn:bnum:', B.subject_id)
       ) AS item_statements
       FROM resource_statement B
  WHERE B.predicate='rdf:type' AND B.object_id = 'nypl:Bib'
       GROUP BY B.subject_id
       OFFSET ${options.offset}
       LIMIT ${options.limit}`
    /*
    var query = `SELECT *
      FROM (
        SELECT B.bnum, array_agg(DISTINCT B.statements) as bib, array_agg(I.item) as items
        FROM (
          SELECT _B.subject_id AS bnum, array_to_json(array_agg(S))::jsonb AS statements
            FROM resource_statement _B
            INNER JOIN (
              SELECT _S.subject_id, _S.predicate, _S.object_id, _S.object_literal, _S.object_label, _S.object_type
              FROM resource_statement _S
            ) S ON S.subject_id = _B.subject_id
            WHERE _B.predicate = 'rdf:type' AND _B.object_id = 'nypl:Bib'
            GROUP BY _B.subject_id
        ) B
        LEFT JOIN (
          SELECT _I.object_id AS bnum, array_to_json(array_agg(S)) AS item
            FROM resource_statement _I
            INNER JOIN (
              SELECT _S.subject_id, _S.predicate, _S.object_id, _S.object_literal, _S.object_label, _S.object_type
              FROM resource_statement _S
            ) S ON S.subject_id = _I.subject_id
            WHERE _I.predicate = 'nypl:bnum'
            GROUP BY _I.object_id, _I.subject_id
        ) I ON I.bnum = CONCAT('urn:bnum:', B.bnum)
        GROUP BY B.bnum
      ) BIBS`
    */
    return resources.stream(query, options)
  }
}

/*
const tripleSchema = {
  subject_id: { type: 'text', size: 100, key: true },
  predicate: { type: 'text', size: 50, key: true },
  // rule_uri: { type: 'text', size: 100, key: true },
  object_id: { type: 'text', size: 512 },
  object_literal: { type: 'text' },
  object_type: { type: 'text', size: 50 },
  object_label: { type: 'text' },
  source: { type: 'text', size: 20, key: true },
  source_record_id: { type: 'text', size: 50, key: true },
  source_record_path: { type: 'text', size: 50, key: true },
  creator: { type: 'text', size: 20 },
  created: { type: 'date', time: true }
}
*/

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
