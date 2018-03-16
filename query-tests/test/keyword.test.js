const fs = require('fs')

const index = require('../../lib/index')
const envConfigHelper = require('../../lib/env-config-helper')
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

  describe('Description', function () {
    it('should match cb6240214 by description', function () {
      // Content of description is "这次孙子兵法国际研讨会首次将孙子思想与大国关系和中国和平发展主题相结合,在三天时间里,30多个国家和海峡两岸,香港地区的近300名专家学者,将围绕\"大国关系与国家安全\",\"大国的国防政策\",\"军事互信和军事合作\",\"台海形势及其走向\",\"孙子兵法与世界军事文化遗产\"等…"
      return search(keywordQuery('这次孙子兵法国际研讨会首次将孙子思想与大国关系和中国和平发展主题相结合')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('cb6240214')
      })
    })
  })
})
