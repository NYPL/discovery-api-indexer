const avro = require('avsc')
const log = require('loglevel')
const request = require('request')

var cachedSchemas = {}

function getSchema (type) {
  // schema in cache; just return it as a instant promise
  if (cachedSchemas[type]) {
    log.debug(`Already have ${type} schema`)
    return Promise.resolve(cachedSchemas[type])
  }

  return new Promise((resolve, reject) => {
    var options = {
      uri: process.env['NYPL_API_SCHEMA_URL'] + type,
      json: true
    }

    log.debug(`Loading ${type} schema...`)
    request(options, (error, resp, body) => {
      if (error) {
        reject(error)
      }
      if (body.data && body.data.schema) {
        log.debug(`Sucessfully loaded ${type} schema`, body.data.schema)
        var schema = JSON.parse(body.data.schema)
        cachedSchemas[type] = avro.Type.forSchema(schema)
        log.debug(` schema name is ${cachedSchemas[type].name}`)
        resolve(cachedSchemas[type])
      } else {
        reject('Error fetching ' + type)
      }
    })
  })
}

// Returns a Promise that returns a hash with the named schemas
function getSchemas (schemasToFetch) {
  log.debug('Getting schemas: ', schemasToFetch)
  return Promise.all(schemasToFetch.map((name) => getSchema(name)))
    .then((schemas) => {
      // Check for failed schemas:
      var failed = schemasToFetch.reduce((failed, schemaName) => {
        if (schemas.filter((s) => s.name === schemaName).length === 0) failed.push(schemaName)
        return failed
      }, [])
      if (failed.length > 0) throw new Error('Failed to get schemas: ', failed)

      return schemas.reduce((h, schema) => {
        h[schema.name] = schema
        return h
      }, {})
    })
}

module.exports = { getSchema, getSchemas }
