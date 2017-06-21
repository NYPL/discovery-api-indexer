'use strict'

const Base = require('./base')
const db = require('../db')

class Item extends Base {
  isResearch () {
    // Research items have catalogItemType between 1-100
    return /^[pc]/.test(this.uri) ||
      /catalogItemType:(\d{1,2}|100)$/.test(this.objectId('nypl:catalogItemType'))
  }
}

Item.byId = (id) => {
  return db.getStatements('resource', id).then((s) => new Item(s))
}

Item.fromStatements = (stmts) => {
  var doc = new Item(stmts.map((s) => ({ subject_id: s.s, predicate: s.pr, object_id: s.id, object_literal: s.li, object_label: s.la })))
  doc.uri = stmts[0].s
  return doc
}

module.exports = Item
