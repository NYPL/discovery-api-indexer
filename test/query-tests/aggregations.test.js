const fs = require('fs')

const index = require('../../lib/index')
const expect = require('chai').expect

const aggregationsQuery = () => {
  const query = {
    body: JSON.parse(fs.readFileSync('./test/query-tests/query-templates/aggregations-query.json', 'utf8'))
  }
  return query
}

const search = (params) => {
  const queryBody = Object.assign({ index: process.env.ELASTIC_RESOURCES_INDEX_NAME }, params)
  return index.search(queryBody)
}

describe('Aggregations', function () {
  it('should return all aggregations', function () {
    return search(aggregationsQuery()).then((result) => {
      expect(result).to.be.a('object')
      expect(result.aggregations).to.be.a('object')
      const aggs = Object.keys(result.aggregations).map((property) => {
        return {
          property,
          buckets: result.aggregations[property].buckets || result.aggregations[property]._nested.buckets
        }
      })
      // We expect result to contain an aggregation for each aggregation we requested:
      const expectedAggregationKeys = Object.keys(aggregationsQuery().body.aggregations)
      expect(aggs).to.have.lengthOf(expectedAggregationKeys.length)
      expect(aggs.map((a) => a.property)).to.have.members(expectedAggregationKeys)

      // We expect each agg to have 3+ buckets:
      aggs.forEach((agg) => {
        expect(agg.buckets.length).to.be.at.least(3)
      })
    })
  })
})
