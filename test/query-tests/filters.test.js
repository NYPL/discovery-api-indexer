const fs = require('fs')

const index = require('../../lib/index')
const envConfigHelper = require('../../lib/env-config-helper')
const expect = require('chai').expect

const nestedFilterQuery = (path, filters, sort) => {
  const query = {
    body: JSON.parse(fs.readFileSync('./test/query-tests/query-templates/nested-filter-query-template.json', 'utf8'))
  }
  query.body.query.nested.path = path
  query.body.query.nested.query.constant_score.filter.bool.should = filters
  if (sort) query.body.sort = [ sort ]
  return query
}

const nestedFilterByEntityQuery = (path, entityName, value) => {
  // Officially we match against entity.id (e.g. language.id = 'lang:chi'):
  const idProp = `${entityName}.id`
  // In practice, we allow matching against label in case an api
  // query is hand-edited, e.g. filters[language]=Chinese
  // So, this is the label property we also match against:
  const labelProp = `${entityName}.label`

  return nestedFilterQuery(path, [
    {
      bool: {
        should: [
          {
            term: {
              [idProp]: value
            }
          },
          {
            term: {
              [labelProp]: value
            }
          }
        ]
      }
    }
  ])
}

const filterQuery = (filters, sort) => {
  const query = {
    body: JSON.parse(fs.readFileSync('./test/query-tests/query-templates/filter-query-template.json', 'utf8'))
  }
  query.body.query.bool.filter = filters
  if (sort) query.body.sort = [ sort ]
  return query
}

const filterByEntityQuery = (entityName, value) => {
  // Officially we match against entity.id (e.g. language.id = 'lang:chi'):
  const idProp = `${entityName}.id`
  // In practice, we allow matching against label in case an api
  // query is hand-edited, e.g. filters[language]=Chinese
  // So, this is the label property we also match against:
  const labelProp = `${entityName}.label`

  return filterQuery([
    {
      bool: {
        should: [
          {
            term: {
              [idProp]: value
            }
          },
          {
            term: {
              [labelProp]: value
            }
          }
        ]
      }
    }
  ])
}

const search = (params) => {
  const queryBody = Object.assign({ index: process.env.ELASTIC_RESOURCES_INDEX_NAME }, params)
  return index.search(queryBody)
}

describe('Filter querying', function () {
  before(function () {
    process.env.ELASTIC_RESOURCES_INDEX_NAME = 'resources-test-index'

    // Initialize connections
    return envConfigHelper.init({ index })
  })

  describe('materialType', function () {
    it('should match b11070917 by materialType Audio (resourcetypes:aud)', function () {
      return search(filterByEntityQuery('materialType', 'resourcetypes:aud')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b11070917')
      })
    })
  })

  describe('carrierType', function () {
    it('should match b11253008 by carrierType videocassette (carriertypes:vf)', function () {
      return search(filterByEntityQuery('carrierType', 'carriertypes:vf')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b11253008')
      })
    })
  })

  describe('languages', function () {
    it('should match cb6240214 by lang:chi', function () {
      return search(filterByEntityQuery('language', 'lang:chi')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('cb6240214')
      })
    })
  })

  describe('dates', function () {
    it('should match b10018031 by date filter', function () {
      const filters = [
        {
          range: {
            dateEndYear: {
              gte: 1978
            }
          }
        }
      ]
      const sort = { dateStartYear: 'asc' }

      return search(filterQuery(filters, sort)).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.be.greaterThan(0)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10018031')
      })
    })
  })

  describe('updatedAt', function () {
    it('can be matched using an ISO date string (to exclude)', function () {
      const filters = [
        {
          range: {
            updatedAt: {
              gt: (new Date()).toISOString()
            }
          }
        }
      ]
      const sort = { updatedAt: 'asc' }

      return search(filterQuery(filters, sort)).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(0)
      })
    })

    it('can be matched using an ISO date string (to include)', function () {
      const filters = [
        {
          range: {
            updatedAt: {
              lte: (new Date()).toISOString()
            }
          }
        }
      ]
      const sort = { updatedAt: 'asc' }

      return search(filterQuery(filters, sort)).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        // At writing we're indexing 20 docs, so we can assume 20+ matches:
        expect(result.hits.total).to.be.greaterThan(19)
      })
    })
  })

  describe('Item filters', function () {
    describe('owner', function () {
      it('should match cb6240214 by owner=orgs:0002', function () {
        return search(nestedFilterByEntityQuery('items', 'items.owner', 'orgs:0002')).then((result) => {
          expect(result).to.be.a('object')
          expect(result.hits).to.be.a('object')
          expect(result.hits.total).to.equal(1)
          expect(result.hits.hits[0]).to.be.a('object')
          expect(result.hits.hits[0]._id).to.equal('cb6240214')
        })
      })

      it('should match cb6240214 by owner=Columbia', function () {
        return search(nestedFilterByEntityQuery('items', 'items.owner', 'Columbia University Libraries')).then((result) => {
          expect(result).to.be.a('object')
          expect(result.hits).to.be.a('object')
          expect(result.hits.total).to.equal(1)
          expect(result.hits.hits[0]).to.be.a('object')
          expect(result.hits.hits[0]._id).to.equal('cb6240214')
        })
      })
    })

    describe('holdingLocation', function () {
      it('should match b18932917 by holdingLocation Schomburg', function () {
        return search(nestedFilterByEntityQuery('items', 'items.holdingLocation', 'loc:scdd2')).then((result) => {
          expect(result).to.be.a('object')
          expect(result.hits).to.be.a('object')
          expect(result.hits.total).to.equal(1)
          expect(result.hits.hits[0]).to.be.a('object')
          expect(result.hits.hits[0]._id).to.equal('b18932917')
        })
      })
    })
  })
})
