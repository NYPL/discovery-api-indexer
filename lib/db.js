'use strict'

const log = require('loglevel')
const url = require('url')

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

  // Returns a stream of bibs (i.e. for bulk processing)
  bibsStream (options) {
    var query = this._bibSqlQueryString(options)
    return this.stream(query.sql, query.values, query.options)
  }

  // Returns bibs matching uris (bnums)
  bibs (uris) {
    var query = this._bibSqlQueryString({ subject_ids: uris, offset: 0, limit: uris.length })
    return db.many(query.sql, query.values, query.options).then((resources) => {
      if (resources) log.debug('Retrieved ' + resources.length + ' resources for ' + uris.length + ' uris')
      else log.debug('Retrieved NO bibs for ' + uris)

      return resources
    })
  }

  // Return single bib matching uri (bnum)
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
      "B.predicate='rdfs:type'",
      "B.object_id IN ('nypl:Item', 'nypl:Collection')"
    ]
    // Match one subject:
    if (options.subject_id) {
      whereClauses.push('B.subject_id=${subject_id}')
      ret.values = { subject_id: options.subject_id }
    }
    // Match multiple subjects:
    if (options.subject_ids) {
      whereClauses.push('B.subject_id IN (${subject_ids:csv})')
      ret.values = { subject_ids: options.subject_ids }
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

  // Set connection creds by URI:
  const params = url.parse(uri)
  const auth = params.auth.split(':')
  let connectionConfig = {
    user: auth[0],
    password: auth[1],
    host: params.hostname,
    port: params.port,
    database: params.pathname.split('/')[1],
    application_name: 'discovery-index-poster#v0.0.1'
  }

  db = pgp(connectionConfig)
}

var disconnect = () => {
  return pgp.end()
}

var connected = () => {
  return Boolean(__connection_uri)
}

module.exports = { setConnection, connected, resources, getStatements, getItemStatements, stream, disconnect }
