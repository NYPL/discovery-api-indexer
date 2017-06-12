'use strict'

const log = require('loglevel')
log.setLevel(process.env.LOGLEVEL || 'info')

var pgp = require('pg-promise')()
var db = null

var QueryStream = require('pg-query-stream')

var stream = (query, values, options) => {
  var qs = new QueryStream(query, values)

  return new Promise((resolve, reject) => {
    db.stream(qs, (s) => {
      resolve(s)
    }).catch((e) => {
      console.log('stream error: ', e)
    })
  })
}

var resources = new (class {
  stream (sql, values, options) {
    log.debug('Stream SQL: ', sql, log.getLevel())

    return stream(sql, values, options)
  }

  bibs (options) {
    var query = this._bibSqlQueryString(options)
    return this.stream(query.sql, query.values, query.options)
  }

  bib (id) {
    var query = this._bibSqlQueryString({ offset: 0, limit: 1, subject_id: id })
    log.debug('DB: db.one(' + query.sql + ')')
    return db.one(query.sql, query.values, query.options).then((resource) => {
      log.debug('Got rec: ', resource)
      if (resource && resource.bib_statements) log.debug('Retrieved ' + resource.bib_statements.length + ' bib statements, ' + (resource.item_statements && resource.item_statements.length ? resource.item_statements.length + ' item statements' : ''))
      else log.debug('Retrieved null bib for ' + id)

      return resource
    })
  }

  _bibSqlQueryString (options) {
    var ret = {
      sql: null,
      values: null,
      options: options || {}
    }

    var whereClauses = [
      "B.predicate='rdf:type'",
      "B.object_id IN ('nypl:Item', 'nypl:Collection')"
    ]
    if (options.subject_id) {
      whereClauses.push('B.subject_id=${subject_id}')
      ret.values = { subject_id: options.subject_id }
    }
    ret.sql = `
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
       WHERE ${whereClauses.join(' AND ')}
       GROUP BY B.subject_id
       OFFSET ${options.offset}
       LIMIT ${options.limit}`
    log.debug('SQL: ' + ret.sql, options.query)
    return ret
  }
})

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

var __connection_uri = null

var setConnection = (uri) => {
  log.debug('Db: Set connection URI: ' + uri.replace(/:[^@]+@/, ':...@'))
  __connection_uri = uri
  // db = pgp(uri)
  var opts = {
    host: 'discovery-store.cicyc5fazypj.us-east-1.rds.amazonaws.com',
    port: 5432,
    database: 'discovery_store',
    user: 'discovery_user',
    password: 'shadiness34105!thundershower',
    poolSize: 20
  }
  db = pgp(opts)
}

var disconnect = () => {
  return pgp.end()
}

var connected = () => {
  return Boolean(__connection_uri)
}

module.exports = { setConnection, connected, resources, getStatements, getItemStatements, stream, disconnect }
