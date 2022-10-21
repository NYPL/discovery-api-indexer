const assert = require('assert')
const utils = require('../lib/utils')
const expect = require('chai').expect

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

  describe('titleSortTransform', function () {
    const titleSortTransform = utils.titleSortTransform
    it('should remove leading punction', function () {
      assert.equal(titleSortTransform('"five itchy aardvarks"'), 'five itchy aardvarks')
    })

    it('should remove leading underscores', function () {
      assert.equal(titleSortTransform('___etc__'), 'etc__')
    })

    it('should remove internal punctuation', function () {
      assert.equal(titleSortTransform('hello, world!'), 'hello world')
    })

    it('should remove leading spaces', function () {
      assert.equal(titleSortTransform('    hello world'), 'hello world')
      assert.equal(titleSortTransform(' hello world'), 'hello world')
    })

    it('should lowercase', function () {
      assert.equal(titleSortTransform('HeLlO wOrLd'), 'hello world')
    })

    it('should condense contiguous whitespace', function () {
      assert.equal(titleSortTransform('hello      world'), 'hello world')
    })

    it('should replace / and - with spaces', function () {
      assert.equal(titleSortTransform('he//o-world'), 'he o world')
      assert.equal(titleSortTransform('--he//o-world'), 'he o world')
    })

    it('should apply char folding', function () {
      assert.equal(titleSortTransform('naïve'), 'naive')
    })
  })

  describe('isArrayWithValues', function () {
    it('should pass valid arrays', function () {
      expect(utils.isArrayWithValues([1, 1])).to.equal(true)
      expect(utils.isArrayWithValues([[1, 1]])).to.equal(true)
      expect(utils.isArrayWithValues([[1, 1], [2, 3]])).to.equal(true)
      expect(utils.isArrayWithValues([[[1, 1]], [2, 3]])).to.equal(true)
    })

    it('should fail invalid arrays', function () {
      expect(utils.isArrayWithValues()).to.equal(false)
      expect(utils.isArrayWithValues([])).to.equal(false)
      expect(utils.isArrayWithValues([[]])).to.equal(false)
      expect(utils.isArrayWithValues([[], []])).to.equal(false)
      expect(utils.isArrayWithValues([[[]], [], [[]]])).to.equal(false)
      expect(utils.isArrayWithValues([[], [[2]]])).to.equal(false)
      expect(utils.isArrayWithValues([[], [2]], 1)).to.equal(false)
      expect(utils.isArrayWithValues(1)).to.equal(false)
    })
  })

  describe('leftPad', function () {
    it('left pads to specified length', function () {
      expect(utils.leftPad('', 8)).to.equal('00000000')
      expect(utils.leftPad('', 2)).to.equal('00')
      expect(utils.leftPad('what', 8)).to.equal('0000what')
    })

    it('left pads with specified char', function () {
      expect(utils.leftPad('', 8, ' ')).to.equal('        ')
      expect(utils.leftPad('what', 8, ' ')).to.equal('    what')
      expect(utils.leftPad('what', 8, '*')).to.equal('****what')
    })

    it('stringifies non-string inputs', function () {
      expect(utils.leftPad(undefined, 3, ' ')).to.equal('   ')
      expect(utils.leftPad(null, 3, ' ')).to.equal('   ')
      expect(utils.leftPad(10, 3, ' ')).to.equal(' 10')
      expect(utils.leftPad(true, 5, ' ')).to.equal(' true')
    })
  })
})
