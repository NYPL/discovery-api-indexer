const assert = require('assert')
const utils = require('../lib/utils')

describe('Utils', function () {
  describe('deepFilterByKey', function () {
    it('should filter by key on single level object', function () {
      const h = utils.deepFilterByKey({ a: 'a value', b: 'b value' }, (key, value) => {
        return key === 'a'
      })
      assert(h)
      assert(h.a)
      assert(!h.b)
    })

    it('should filter by value on single level object', function () {
      const h = utils.deepFilterByKey({ a: 'a value', b: 'b value' }, (key, value) => {
        return value === 'a value'
      })
      assert(h)
      assert(h.a)
      assert(!h.b)
    })

    it('should filter by key/value on deep object', function () {
      const obj = {
        a: 'a value',
        b: 'bad value',
        badKey: '',
        c: {
          badKey: '',
          deepObject: {
            deeperObject: 'bad value'
          }
        }
      }
      const h = utils.deepFilterByKey(obj, (key, value) => {
        return key !== 'badKey' && value !== 'bad value'
      })

      /* We expect h to be:
       * {
       *   a: 'a value',
       *   c: {
       *     deepObject: {}
       *   }
       * }
       */
      assert(h)
      assert(h.a)
      assert(!h.b)
      assert(!h.badKey)
      assert(h.c)
      assert(h.c.deepObject)
      assert(!h.c.deepObject.deeperObject)
    })
  })

  describe('explodedSubjectLiterals', function () {
    it('should create a list of triples with all the higher-level subjects represented', function () {
      const testTriple = {
        subject_id: undefined,
        predicate: 'dc:subject',
        object_id: null,
        object_type: null,
        object_literal: 'Arabian Peninsula -- Religion -- Ancient History.',
        object_label: null
      }

      const explodedSubjectLiterals = utils.explodedSubjectLiterals(testTriple)
      assert.equal(explodedSubjectLiterals.length, 3)
      assert.equal(explodedSubjectLiterals[0], 'Arabian Peninsula')
      assert.equal(explodedSubjectLiterals[1], 'Arabian Peninsula -- Religion')
      assert.equal(explodedSubjectLiterals[2], 'Arabian Peninsula -- Religion -- Ancient History')
    })

    it('should not break when given a triple with no higher-level subjects', function () {
      const testTriple = {
        subject_id: undefined,
        predicate: 'dc:subject',
        object_id: null,
        object_type: null,
        object_literal: 'Arabian Peninsula.',
        object_label: null
      }

      const explodedSubjectLiterals = utils.explodedSubjectLiterals(testTriple)
      assert.equal(explodedSubjectLiterals.length, 1)
      assert.equal(explodedSubjectLiterals[0], 'Arabian Peninsula')
    })
  })
})
