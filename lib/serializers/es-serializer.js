'use strict'

class EsSerializer {
  constructor (object) {
    this.object = object
    this.statements = {}
  }

  addStatement (key, value, label, opts = {}) {
    opts = Object.assign({
      // By default, add a packed field if label is set
      addPackedField: label
    }, opts)

    if (this.hasStatement(key, value)) return this

    var _val = value
    if (label) _val = { id: value, label: label }

    if (!this.statements[key]) this.statements[key] = [_val]
    else this.statements[key].push(_val)

    if (opts.addPackedField) {
      this.addPackedStatement(key, value, label)
    }
    return this
  }

  hasStatement (key, value) {
    return this.statements[key] &&
      (
        ((typeof this.statements[key]) === 'object' && this.statements[key].indexOf(value) >= 0) ||
        ((typeof this.statements[key]) !== 'object' && this.statements[key] === value)
      )
  }

  addPackedStatement (key, value, label) {
    var packedVal = [value, label].join('||')
    return this.addStatement(`${key}_packed`, packedVal)
  }
}

module.exports = EsSerializer
