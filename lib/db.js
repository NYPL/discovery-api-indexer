'use strict'

var config = require('config')
var MongoClient = require('mongodb').MongoClient

var __connection = null
function connect () {
  // returns a promise:
  if (__connection) {
    return Promise.resolve(__connection)
  } else {
    return MongoClient.connect(config.get('mongo.url')).then((connection) => {
      __connection = connection
      return __connection
    })
  }
}

/*
function find (collection, pk) {
  return connect().then((connection) => {
    connection.collection(collection).find(pk)
  })
}

function findOne (collection, query) {
  return connect().then((connection) => {
    return connection.collection(collection).findOne(query).then((record) => TriplesDoc.from(record))
  })
}

function count (collection, query) {
  return connect().then((connection) => connection.collection(collection).count(query))
}
*/

class TriplesDoc {
  constructor (h) {
    for (var k in h) {
      this[k] = h[k]
    }
  }

  has (pred) {
    return Object.keys(this).indexOf(pred) >= 0 && (typeof this[pred]) === 'object' && this[pred].filter((e) => e !== null).length > 0
  }

  each (pred, cb) {
    return this[pred].map((trip) => cb(trip))
  }

  get (pred) {
    return this[pred][0]
  }

  literal (pred, def) {
    return (this[pred] && this[pred][0] && this[pred][0].objectLiteral) || def
  }
}

TriplesDoc.from = (record) => {
  return new TriplesDoc(record)
}

var db = {}

db.connect = connect
db.resources = () => connect().then((connection) => connection.collection('resources'))
db.resources.findOne = (query) => db.resources().then((coll) => coll.findOne(query)).then(TriplesDoc.from)
db.resources.find = (query) => db.resources().then((coll) => coll.find(query)).then((records) => records.map(TriplesDoc.from))

db.locations = () => connect().then((connection) => connection.collection('locations'))
db.locations.findOne = (query) => db.locations().then((coll) => coll.findOne(query)).then(TriplesDoc.from)

db.TriplesDoc = TriplesDoc

// db.connect = connect

module.exports = db
