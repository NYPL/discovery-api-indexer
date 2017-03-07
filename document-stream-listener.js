/*
  This is a lambda that listens to the discovery-queue-manager (https://github.com/NYPL-discovery/discovery-queue-manager)
  via a Kinesis stream that contains document URIs that should be indexed/re-indexed
  then runs the index job with the document URI
*/

console.log('Loading Document Stream Listener');

const _ = require('highland');
const avro = require('avsc');
const childProcess = require('child_process');
const schema = require('./document-avro-schema.js');

// kinesis stream handler
exports.kinesisHandler = function(records, context) {
  console.log('Processing ' + records.length + ' records');

  // initialize avro schema
  const avroType = avro.parse(schema);

  // process kinesis records
  var data = records
    .map(parseData);

  // index each document
  _(data)
    .each(indexDocument);

  // executes a index resource job with URI
  function indexDocument(doc) {
    var args = ['--uri', `${doc.uri}`];
    runScript(`./jobs/index-resources`, args, function (err) {
      if (err) throw err;
    });
  }

  // map to records objects as needed
  function parseData(payload) {
    // decode base64
    var buf = new Buffer(payload.kinesis.data, 'base64');
    // decode avro
    var record = avroType.fromBuffer(buf);
    return record;
  }

  function runScript(scriptPath, args, callback) {
    // keep track of whether callback has been invoked to prevent multiple invocations
    var invoked = false;
    var process = childProcess.fork(scriptPath, args);

    // listen for errors as they may prevent the exit event from firing
    process.on('error', function (err) {
      if (invoked) return;
      invoked = true;
      callback(err);
    });

    // execute the callback once the process has finished running
    process.on('exit', function (code) {
      if (invoked) return;
      invoked = true;
      var err = code === 0 ? null : new Error('exit code ' + code);
      callback(err);
    });
  }

  context.done();
};

// main function
exports.handler = function(event, context) {
  var record = event.Records[0];
  if (record.kinesis) {
    exports.kinesisHandler(event.Records, context);
  }
};
