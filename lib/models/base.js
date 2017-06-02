'use strict'

class Base {
  constructor (stmts) {
    this._statements = stmts
    if (this._statements && this._statements.length > 0) this.id = this._statements[0].subject_id
  }

  each (pred, cb) {
    return this.statements(pred)
      .sort((p1, p2) => {
        if (p1.object_id && p2.object_id) return p1.object_id > p2.object_id ? 1 : -1
        else if (p1.object_literal && p2.object_literal) return p1.object_literal > p2.object_literal ? 1 : -1
      })
      .map((trip) => cb(trip))
  }

  get (pred) {
    return this.statement(pred)
  }

  has (pred) {
    return this.statements(pred).length > 0
  }

  statements (pred) {
    return this._statements.filter((s) => s.predicate === pred)
  }

  statement (pred) {
    return this.statements(pred)[0]
  }

  literals (pred) {
    return this.statements(pred).map((s) => s.object_literal)
  }

  literal (pred) {
    return this.literals(pred)[0]
  }

  objectIds (pred) {
    return this.statements(pred).map((s) => s.object_id)
  }

  objectId (pred) {
    return this.objectIds(pred)[0]
  }

  label () {
    return this.literal('skos:prefLabel')
  }
}

module.exports = Base
