const catalogItemTypeMapping = require('@nypl/nypl-core-objects')('by-catalog-item-type')
const Base = require('./base')
const db = require('../db')

class Item extends Base {
  isResearch () {
    // Check catalogItemTypes json-ld vocab to see if itype's collectionTypes includes 'Research':
    let itype = this.objectId('nypl:catalogItemType')
    let itypeIsResearch = itype &&
      catalogItemTypeMapping[itype] &&
      catalogItemTypeMapping[itype].collectionType.indexOf('Research') >= 0

    return /^[pc]/.test(this.uri) || itypeIsResearch
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
