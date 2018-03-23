const fs = require('fs')

const index = require('../../lib/index')
const expect = require('chai').expect

const keywordQuery = (term, searchScope = 'all') => {
  const query = {
    body: JSON.parse(fs.readFileSync('./test/query-tests/query-templates/keyword-query.json', 'utf8'))
  }

  let customFields = null
  let extraShouldClauses = null
  switch (searchScope) {
    case 'title':
      customFields = [
        'title.folded^5',
        'seriesStatement.folded',
        'titleAlt.folded',
        'uniformTitle.folded',
        'titleDisplay.folded'
      ]
      break
    case 'contributor':
      customFields = [
        'creatorLiteral.folded^2',
        'contributorLiteral.folded'
      ]
      break
    case 'subject':
      customFields = [
        'subjectLiteral.folded'
      ]
      break
    case 'series':
      customFields = [
        'seriesStatement.folded'
      ]
      break
    case 'callnumber':
      customFields = [
        'shelfMark'
      ]
      break
    case 'identifier':
      customFields = [
        'shelfMark',
        'uri'
      ]
      // In addition to root bib fields, we want to add a should clause to match nested item identifiers:
      break
    default:
      customFields = [
        'title.folded^5',
        'description.folded',
        'subjectLiteral.folded',
        'creatorLiteral.folded',
        'contributorLiteral.folded',
        'note.label.folded',
        'publisherLiteral.folded',
        'seriesStatement.folded',
        'titleAlt.folded',
        'titleDisplay.folded'
      ]
  }

  if (['all', 'identifier'].indexOf(searchScope) >= 0) {
    extraShouldClauses = [
      {
        nested: {
          path: 'items',
          query: {
            bool: {
              should: [
                {
                  wildcard: {
                    'items.identifierV2.value': term
                  }
                },
                {
                  term: {
                    'items.uri': term
                  }
                }
              ]
            }
          }
        }
      },
      {
        wildcard: {
          'identifierV2.value': term
        }
      }
    ]
  }
  if (customFields) query.body.query.function_score.query.bool.should[0].query_string.fields = customFields
  if (extraShouldClauses) query.body.query.function_score.query.bool.should = query.body.query.function_score.query.bool.should.concat(extraShouldClauses)

  query.body.query.function_score.query.bool.should[0].query_string.query = term.replace(/:/g, '\\:')

  return query
}

const search = (params) => {
  const queryBody = Object.assign({ index: process.env.ELASTIC_RESOURCES_INDEX_NAME }, params)
  // console.log('qry: ', JSON.stringify(queryBody, null, 2))
  return index.search(queryBody)
}

describe('Keyword querying', function () {
  describe('with search_scope "title"', function () {
    it('should match b10011745 based on titleAlt', function () {
      return search(keywordQuery('IJBD', 'title')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10011745')
      })
    })

    it('should match b10011745 based on titleAlt.folded', function () {
      return search(keywordQuery('ïjbd', 'title')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10011745')
      })
    })

    it('should match b10610175 based on titleDisplay', function () {
      // "Gwendolyn Brooks" is credited *only* in titleDisplay (from 245 $c)
      // so confirm we can find the book:
      return search(keywordQuery('Gwendolyn Brooks', 'title')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10610175')
      })
    })

    it('should match b10681848 based on title', function () {
      return search(keywordQuery('catalogue raisonné', 'title')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10681848')
      })
    })

    it('should match b10681848 based on title.folded', function () {
      return search(keywordQuery('catalogue raisonne', 'title')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10681848')
      })
    })
  })

  describe('with search_scope "contributor"', function () {
    it('should match b10610175 based on creatorLiteral', function () {
      return search(keywordQuery('Hopkins', 'contributor')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10610175')
      })
    })

    it('should match b11253008 based on contributorLiteral', function () {
      return search(keywordQuery('World Institute of Black Communications', 'contributor')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b11253008')
      })
    })
  })

  describe('with search_scope "subject"', function () {
    it('should match b12155601 based on subjectLiteral', function () {
      return search(keywordQuery('Dolinoff, Alexis', 'subject')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b12155601')
      })
    })
  })

  describe('with search_scope "series"', function () {
    it('should match b20972964 based on seriesStatement', function () {
      return search(keywordQuery('Juan García Jiménez', 'series')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b20972964 based on seriesStatement.folded', function () {
      return search(keywordQuery('Juan Garcia', 'series')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b20972964')
      })
    })

    it('should match b19995767 based on exact seriesStatement', function () {
      return search(keywordQuery('S. hrg. ; 113-30', 'series')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b19995767')
      })
    })
  })

  describe('with search_scope "callnumber"', function () {
    it('should match b18932917 based on shelfMark', function () {
      return search(keywordQuery('Sc MG 162', 'callnumber')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b18932917')
      })
    })

    it('should match records by shelfMark prefix', function () {
      return search(keywordQuery('Sc', 'callnumber')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        // At writing this matches 3:
        expect(result.hits.total).to.be.at.least(3)
        // Let's make sure it's not matching everything (but be flexible to
        // a few new matching fixtures over time):
        expect(result.hits.total).to.be.at.most(5)
      })
    })
  })

  describe('with search_scope "identifier"', function () {
    it('should match b18932917 based on shelfMark', function () {
      return search(keywordQuery('Sc MG 162', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b18932917')
      })
    })

    it('should match b18064236 by actual bnumber', function () {
      return search(keywordQuery('b18064236', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b18064236')
      })
    })

    it('should match b10018031 by lccn', function () {
      return search(keywordQuery('sf 80001307', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10018031')
      })
    })

    it('should match b10018031 by barcode', function () {
      return search(keywordQuery('33433093396772', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10018031')
      })
    })

    it('should match b10018031 by item bnum identifier', function () {
      return search(keywordQuery('10018031', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10018031')
      })
    })

    it('should match b11076048 issn', function () {
      return search(keywordQuery('0518-3839', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b11076048')
      })
    })

    it('should match cb6240214 by isbn', function () {
      return search(keywordQuery('780237071X', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('cb6240214')
      })
    })

    it('should match cb6240214 by CUL barcode', function () {
      return search(keywordQuery('CU13833405', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('cb6240214')
      })
    })

    it('should match pb176961 by CUL inumber', function () {
      return search(keywordQuery('pi189241', 'identifier')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('pb176961')
      })
    })
  })

  describe('with search_scope "all"', function () {
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

    it('should match b10681848 by words in title', function () {
      // Actual title is "Victor Pasmore : a catalogue raisonné of the
      // paintings, constructions, and graphics, 1926-1979"
      return search(keywordQuery('pasmore catalogue')).then((result) => {
        expect(result).to.be.a('object')
        expect(result.hits).to.be.a('object')
        expect(result.hits.total).to.equal(1)
        expect(result.hits.hits[0]).to.be.a('object')
        expect(result.hits.hits[0]._id).to.equal('b10681848')
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

      // Retiring this because a quoted shelfmark won't match and doesn't need
      // to now that we're including a `wildcard` match against shelfMark
      /*
      it('should match b10011374 by shelfMark with quotes', function () {
        return search(keywordQuery('"JFE 86-498"')).then((result) => {
          expect(result).to.be.a('object')
          expect(result.hits).to.be.a('object')
          expect(result.hits.total).to.equal(1)
          expect(result.hits.hits[0]).to.be.a('object')
          expect(result.hits.hits[0]._id).to.equal('b10011374')
        })
      })
      */
    })

    describe('Publisher', function () {
      it('should match b20972964 by publisherLiteral', function () {
        // Note we have to escape colons in query_string queries in general lest
        // they be interpretted as field identifiers:
        return search(keywordQuery('Guerrero, Gobierno del Estado Libre y Soberano, Secretaría de Cultura ; CONACULTA : Editorial Praxis,')).then((result) => {
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

    describe('Identifiers', function () {
      it('should match b10018031 by identifier (barcode)', function () {
        return search(keywordQuery('33433093396772')).then((result) => {
          expect(result).to.be.a('object')
          expect(result.hits).to.be.a('object')
          expect(result.hits.total).to.equal(1)
          expect(result.hits.hits[0]).to.be.a('object')
          expect(result.hits.hits[0]._id).to.equal('b10018031')
        })
      })

      it('should match b10018031 by partial identifier (barcode)', function () {
        return search(keywordQuery('3343309339677*')).then((result) => {
          expect(result).to.be.a('object')
          expect(result.hits).to.be.a('object')
          expect(result.hits.total).to.equal(1)
          expect(result.hits.hits[0]).to.be.a('object')
          expect(result.hits.hits[0]._id).to.equal('b10018031')
        })
      })
    })
  })
})
