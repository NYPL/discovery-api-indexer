'use strict'

const Base = require('./base')
const db = require('../db')
const utils = require('../utils')

class Bib extends Base {

  // Helper to check a bib's suppressed flag:
  isSuppressed () {
    return this.booleanLiteral('nypl:suppressed')
  }

  // Helper to determine if a bib's items make the bib research or circulating
  isResearch () {
    // It's a research item if it has 0 items (we have to assume) or at least one research item:
    return (this._items || []).length === 0 ||
      this._items.filter((item) => item.isResearch()).length > 0
  }
}

Bib.byId = (id) => {
  return db.getStatements('resource', id).then((s) => new Bib(s))
}

Bib.fromStatements = (s) => {
  var doc = new Bib(s.bib_statements.map((s) => ({ subject_id: s.subject_id, predicate: s.pr, object_id: s.id, object_literal: s.li, object_label: s.la })))
  doc.uri = s.subject_id
  doc._items = []
  if (s.item_statements) {
    utils.groupBy(s.item_statements, 's')
    doc._items = utils.groupBy(s.item_statements, 's')
    doc._items = doc._items.map((stmts) => {
      var item = new Bib(stmts.map((s) => ({ subject_id: s.s, predicate: s.pr, object_id: s.id, object_literal: s.li, object_label: s.la })))
      item.uri = stmts[0].s
      return item
    })
  }
  return doc
}

module.exports = Bib
