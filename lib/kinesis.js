'use strict'

const AWS = require('aws-sdk')
const kinesis = new AWS.Kinesis({ region: 'us-east-1' })
const config = require('config')
const log = require('loglevel')

const kinesisWriteStream = config.kinesisWriteStream

/*
function _createStreamIfNotCreated (callback) {
  var params = {
    ShardCount: kinesisWriteStream.shards,
    StreamName: kinesisWriteStream.stream
  }

  kinesis.createStream(params, function (err, data) {
    if (err) {
      if (err.code !== 'ResourceInUseException') {
        callback(err)
        return
      } else {
        log.debug('%s stream is already created. Re-using it.', kinesisWriteStream.stream)
      }
    } else {
      log.debug("%s stream doesn't exist. Created a new stream with that name ..", kinesisWriteStream.stream)
    }

    // Poll to make sure stream is in ACTIVE state before start pushing data.
    _waitForStreamToBecomeActive(callback)
  })
}

function _waitForStreamToBecomeActive (callback) {
  log.debug('_waitForStreamToBecomeActive')
  kinesis.describeStream({StreamName: kinesisWriteStream.stream}, function (err, data) {
    if (!err) {
      log.debug('Current status of the stream is %s.', data.StreamDescription.StreamStatus)
      if (data.StreamDescription.StreamStatus === 'ACTIVE') {
        callback(null)
      } else {
        setTimeout(function () {
          _waitForStreamToBecomeActive(callback)
        }, 1000 * kinesisWriteStream.waitBetweenDescribeCallsInSeconds)
      }
    }
  })
}
*/

function _writeToKinesis (object, type) {
  return new Promise((resolve, reject) => {
    var recordParams = {
      Data: type.toBuffer(object),
      PartitionKey: 'sensor-' + Math.floor(Math.random() * 100000),
      StreamName: kinesisWriteStream.stream
    }

    kinesis.putRecord(recordParams, function (err, data) {
      if (err) {
        log.error(err)
        reject('kinesis.putRecords error')
      } else {
        log.info(`Successfully sent id ${object.id} to ${kinesisWriteStream.stream} kinesis.`)
        resolve()
      }
    })
  }).catch((e) => {
    log.error('Error (KinesisWriter#_writeToKinesis): ', e.message)
  })
}

class KinesisWriter {
  // Takes an object with a `statements` property that contains Statements to be written to the stream
  write (object, type) {
    return _writeToKinesis(object, type)
    /*
    return new Promise((resolve, reject) => {
      _createStreamIfNotCreated(function (err) {
        if (err) {
          log.error('Error creating stream: %s', err)
          return
        }
      return _writeToKinesis(object, type).then(resolve)
      })
    })
    */
  }
}

module.exports = KinesisWriter
