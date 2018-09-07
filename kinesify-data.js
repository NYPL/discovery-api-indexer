// Usage:
//  The following command will take an unencoded json document of doc uris, encode it with avro schema, encode it with base64, and put in Kinesis format.
//
//    node kinesify-data [infile] [outfile] [schemaurl]
//
//  e.g.
//    node kinesify-data event.unencoded.json event.json https://api.nypltech.org/api/v0.1/current-schemas/IndexDocument
//
//  Alternatively, give it an array of uris like this to build the encoded event.json directly:
//
//    node kinesify-data --uris "b1234,b4567"

const avro = require('avsc')
const fs = require('fs')
const request = require('request')
const argv = require('minimist')(process.argv.slice(2))

// config
const infile = argv._[0] || 'event.unencoded.json'
const outfile = argv._[1] || 'event.json'
const schemaUrl = argv._[2] || 'https://platform.nypl.org/api/v0.1/current-schemas/IndexDocument'

function onSchemaLoad (schema) {
  // initialize avro schema
  var avroType = avro.parse(schema)

  // encode data and put in kinesis format
  var kinesisEncodedData = unencodedData.Records
    .map(function (record) {
      return kinesify(record, avroType)
    })

  // stringify and write to file
  var json = JSON.stringify({ 'Records': kinesisEncodedData }, null, 2)
  fs.writeFile(outfile, json, 'utf8', function (err, data) {
    if (err) {
      console.log('Write error:', err)
    } else {
      console.log('Successfully wrote data to file')
    }
  })
}

function getValidationIssues (obj, type) {
  var paths = []
  type.isValid(obj, {
    errorHook: function (path, any, type) {
      paths.push({ path, any, type })
    }
  })
  return paths
}

function kinesify (record, avroType) {
  // encode avro
  var buf
  try {
    buf = avroType.toBuffer(record)
  } catch (e) {
    console.log('Validation errors:')
    getValidationIssues(record, avroType).forEach((e) => {
      console.log(`  ${e.path.join('.')}: \n    Got: ${e.value}\n    Expected: ${e.type}`)
    })
    console.log('Aborting because problems.')
    process.exit()
  }
  // encode base64
  var encoded = buf.toString('base64')
  // kinesis format
  return {
    'kinesis': {
      'kinesisSchemaVersion': '1.0',
      'partitionKey': 's1',
      'sequenceNumber': '00000000000000000000000000000000000000000000000000000001',
      'data': encoded,
      'approximateArrivalTimestamp': 1428537600
    },
    'eventSource': 'aws:kinesis',
    'eventVersion': '1.0',
    'eventID': 'shardId-000000000000:00000000000000000000000000000000000000000000000000000001',
    'eventName': 'aws:kinesis:record',
    'invokeIdentityArn': 'arn:aws:iam::EXAMPLE',
    'awsRegion': 'us-east-1',
    'eventSourceARN': 'arn:aws:kinesis:us-east-1:224280085904:stream/IndexDocument'
  }
}

// read unencoded data
var unencodedData = null

// Handle uris given as command line arg:
if (argv.uris) {
  let uris = argv.uris.split(',').map((uri) => uri.trim())

  unencodedData = { Records: uris.map((uri) => ({ uri, type: 'bib' })) }
} else {
  unencodedData = JSON.parse(fs.readFileSync(infile, 'utf8'))
}

var options = {
  uri: schemaUrl,
  json: true
}

request(options, function (error, resp, body) {
  if (error) console.log('Error (#request): ' + error)

  if (body.data && body.data.schema) {
    console.log('Loaded schema', body.data.schema)
    var schema = JSON.parse(body.data.schema)
    onSchemaLoad(schema)
  }
})
