const fs = require('fs')

const index = require('../lib/index')
const envConfigHelper = require('../lib/env-config-helper')
const expect = require('chai').expect

const keywordQuery = (term) => {
  const query = {
    body: JSON.parse(fs.readFileSync('./query-tests/keyword-query-template.json', 'utf8'))
  }

  query.body.query.function_score.query.bool.should[0].query_string.query = term

  return query
}

const search = (params) => {
  const queryBody = Object.assign({ index: process.env.ELASTIC_RESOURCES_INDEX_NAME }, params)
  return index.search(queryBody)
}

describe('Keyword querying', function () {
  before(function () {
    process.env.ELASTIC_RESOURCES_INDEX_NAME = 'resources-test-index'

    // Initialize connections
    return envConfigHelper.init({ index })
  })

  describe('titles', function () {
    it('should match b10001936 by title', function () {
      return search(keywordQuery('azgayin patmutʻian')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10001936')
      })
    })

    it('should match b20972964 by title (with accents)', function () {
      return search(keywordQuery('indígena')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b20972964 by title (without accents)', function () {
      return search(keywordQuery('indigena')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b20972964 by titleDisplay (with accents)', function () {
      return search(keywordQuery('Santano González Villalobos')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b20972964 by titleDisplay (without accents)', function () {
      return search(keywordQuery('Santano Gonzalez Villalobos')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })
  })

  it('should match b10001936 by contrib', function () {
    return search(keywordQuery('Shermazanian, Galust')).then((result) => {
      expect(result).to.be.a('object')
      expect(result.hits).to.be.a('object')
      expect(result.hits.total).to.equal(1)
      expect(result.hits.hits[0]).to.be.a('object')
      expect(result.hits.hits[0]._id).to.equal('b10001936')
    })
  })

  describe('notes', function () {
    it('should match b20972964 note (with accents)', function () {
      return search(keywordQuery('Escenográficos')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b20972964 note (without accents)', function () {
      return search(keywordQuery('Escenograficos')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })
  })

  describe('Subjects', function () {
    it('should match b20972964 by subjectLiteral (without accents)', function () {
      return search(keywordQuery('Mexico')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b20972964 by subjectLiteral (with accents)', function () {
      return search(keywordQuery('México')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })
  })

  describe('Series statement', function () {
    it('should match b20972964 by seriesStatement (with accents)', function () {
      return search(keywordQuery('Colección Juan García Jiménez')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b20972964 by seriesStatement (without accents)', function () {
      return search(keywordQuery('Coleccion Juan Garcia Jimenez')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })
  })

  describe('Shelfmark', function () {
    it('should match b10011374 by shelfMark without quotes', function () {
      return search(keywordQuery('JFE 86-498')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10011374')
      })
    })

    it('should match b10011374 by shelfMark with quotes', function () {
      return search(keywordQuery('"JFE 86-498"')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10011374')
      })
    })
  })

  describe('Publisher', function () {
    it('should match b20972964 by publisherLiteral', function () {
      // Note we have to escape colons in query_string queries in general lest
      // they be interpretted as field identifiers:
      return search(keywordQuery('Guerrero, Gobierno del Estado Libre y Soberano, Secretaría de Cultura ; CONACULTA \\: Editorial Praxis,')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })
  })
})
