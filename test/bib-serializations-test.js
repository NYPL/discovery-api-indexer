/* global describe it before after */

const assert = require('assert')
const sinon = require('sinon')
const path = require('path')
const fs = require('fs')
const md5 = require('md5')
const dotenv = require('dotenv')

dotenv.config({ path: './config/test.env' })

const ResourceSerializer = require('../lib/serializers/resource-serializer')
const DiscoveryStoreModels = require('discovery-store-models')
const { Bib } = DiscoveryStoreModels
const NyplClient = require('@nypl/nypl-data-api-client')
const kmsHelper = require('../lib/kms-helper')

const bibFieldMapper = require('../lib/field-mapper')('bib')

const expect = require('chai').expect

function bibFixturePath (id) {
  return path.join(__dirname, `./data/${id}.json`)
}

let getBibByFixture = function (id) {
  if (fs.existsSync(bibFixturePath(id))) {
    let data = JSON.parse(fs.readFileSync(bibFixturePath(id)))
    let bib = Bib.fromDbJsonResult(data)
    return Promise.resolve(bib)
  } else console.log(id + ' not found on disk')
}

const getPlatformEndpointByFixture = function (path) {
  const fixturePath = `./test/data/platform-endpoint-${md5(path)}.json`
  if (fs.existsSync(fixturePath)) {
    let data = JSON.parse(fs.readFileSync(fixturePath))
    return Promise.resolve(data)
  } else console.log(`Fixture ${fixturePath} (for ${path}) not found on disk`)
}

function init () {
  sinon.stub(Bib, 'byId').callsFake(getBibByFixture)
  sinon.stub(NyplClient.prototype, 'get').callsFake(getPlatformEndpointByFixture)
  sinon.stub(kmsHelper, 'decrypt').callsFake(() => Promise.resolve('decrypted!'))

  process.env.NYPL_API_BASE_URL = 'https://example.com'
  process.env.NYPL_OAUTH_KEY = 'oauth-key'
  process.env.NYPL_OAUTH_SECRET = 'oauth-secret'
  process.env.NYPL_OAUTH_URL = 'https://example.com'
}

function destroy () {
  Bib.byId.restore()
  NyplClient.prototype.get.restore()
  kmsHelper.decrypt.restore()
}

describe('Bib Serializations', function () {
  this.timeout(5000)

  before(init)

  after(destroy)

  describe('bibs', function () {
    describe('nyplSource', function () {
      it('should identify NYPL items', function () {
        return Bib.byId('b10681848').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.nyplSource, 'sierra-nypl')
          })
        })
      })

      it('should identify PUL items', function () {
        return Bib.byId('pb176961').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.nyplSource, 'recap-pul')
          })
        })
      })

      it('should identify CUL items', function () {
        return Bib.byId('cb8231282').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.nyplSource, 'recap-cul')
          })
        })
      })

      it('should identify HL items', function () {
        return Bib.byId('hb990049360620203941').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.nyplSource, 'recap-hl')
          })
        })
      })
    })
    describe('numElectronicResources', () => {
      it('should create a numElectronicResources property', () => {
        return Bib.byId('b10011374').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.numElectronicResources, 4)
          })
        })
      })
      it('should subtract items with electronic resources from numItems', () => {
        return Bib.byId('b10011374').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.numItems, 4)
          })
        })
      })
    })

    it('should remove extraneous colons from isbn', () => {
      return Bib.byId('bCrazyIsbn').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.idIsbn[0], '019-211-386X (wow)')
        })
      })
    })

    it('should create idIsbn_clean with only numbers and x', () => {
      return Bib.byId('bCrazyIsbn').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.idIsbn_clean[0], '019211386X')
        })
      })
    })

    it('should have title', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.title[0], 'Victor Pasmore : a catalogue raisonné of the paintings, constructions, and graphics, 1926-1979')
        })
      })
    })

    it('should have title_sort with punctuation removed', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.title_sort[0], 'victor pasmore  a catalogue raisonne of the paintings constructions and graph')
        })
      })
    })

    it('should have alternative title', function () {
      return Bib.byId('b10011745').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.titleAlt[0], 'IJBD')
        })
      })
    })

    it('should have description', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.description[0], 'Geoffrey Holder discusses his work in the Broadway production of Timbuktu where he is the director, choreographer, and costume designer.  He also discusses the influence his family and his birthplace, Trinidad, has on his work.  Holder stresses the need for fantasy and splendor in his work and in the world.')
        })
      })
    })

    it('should have all subject literals', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.subjectLiteral_exploded[0], 'African American fashion designers')
          assert.equal(serialized.subjectLiteral_exploded[1], 'African American fashion designers -- Interviews')
        })
      })
    })

    it('should have contributor literal', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.contributorLiteral[0], 'CEBA Collection.')
          assert.equal(serialized.contributorLiteral[1], 'Coombs, Orde.')
        })
      })
    })

    it('should have creator literal', function () {
      return Bib.byId('b19995767').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.creatorLiteral[0], 'United States. Congress. Joint Economic Committee, author.')
        })
      })
    })

    it('should have dates', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.dateStartYear[0], 1978)
          assert.equal(serialized.createdYear[0], 1978)
          assert.equal(serialized.dateString[0], '1978')
        })
      })
    })

    it('should have mediatype, carriertype', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.mediaType[0].id, 'mediatypes:v')
          assert.equal(serialized.mediaType[0].label, 'video')
          assert.equal(serialized.carrierType[0].id, 'carriertypes:vf')
          assert.equal(serialized.carrierType[0].label, 'videocassette')
        })
      })
    })

    it('should have issuance', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.issuance[0].id, 'urn:biblevel:m')
          assert.equal(serialized.issuance[0].label, 'monograph/item')
        })
      })
    })

    it('should have lots of identifiers', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Deprecated URN style:
          assert(serialized.identifier.indexOf('urn:bnum:11253008') >= 0)
        })
      })
    })

    it('should have language', function () {
      return Bib.byId('b10392955').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.language[0].id, 'lang:eng')
          assert.equal(serialized.language[0].label, 'English')
        })
      })
    })

    it('should have resource type (material type)', function () {
      return Bib.byId('b10392955').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.materialType[0].id, 'resourcetypes:txt')
          assert.equal(serialized.materialType[0].label, 'Text')
        })
      })
    })

    it('should have publisherLiteral', function () {
      return Bib.byId('b10001936').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.publisherLiteral[0], 'Tparan Hovhannu Tēr-Abrahamian,')
        })
      })
    })

    it('should have place of publication', function () {
      return Bib.byId('b10001936').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.placeOfPublication[0], 'Ṛostov (Doni Vra) :')
        })
      })
    })

    it('should have dimensions', function () {
      return Bib.byId('b10001936').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.dimensions[0], '21 cm.')
        })
      })
    })

    it('should have extent', function () {
      return Bib.byId('b10001936').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.extent[0], '400 p. ;')
        })
      })
    })

    it('should have notes', function () {
      return Bib.byId('b10001936').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // This property has changed its indexed property over time, so make
          // sure we're reading the right ES property:
          let prop = bibFieldMapper.getMapping('Note').indexPropertyName || bibFieldMapper.getMapping('Note').jsonLdKey

          assert(serialized[prop])
          assert.equal(serialized[prop].length, 5)

          assert.equal(serialized[prop][0].noteType, 'Note')
          assert.equal(serialized[prop][0].label, 'Publication date from cover.')
          assert.equal(serialized[prop][1].noteType, 'Bibliography')
          assert.equal(serialized[prop][1].label, 'Includes bibliographical references.')
        })
      })
    })

    it('should have LCC classification', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.lccClassification[0], 'N6797.P3 A4 1980')
        })
      })
    })

    it('should have LCCN', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Deprecated URN style:
          assert(serialized.identifier.indexOf('urn:lccn:   79906697') !== -1)
          assert(serialized.idLccn.indexOf('   79906697') !== -1)
        })
      })
    })

    it('should have ISBN', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Deprecated URN style:
          assert(serialized.identifier.indexOf('urn:isbn:0847802779') !== -1)
          assert(serialized.idIsbn.indexOf('0847802779') !== -1)
        })
      })
    })

    it('should have ISSN', function () {
      return Bib.byId('b10011745').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Deprecated URN style:
          assert(serialized.identifier.indexOf('urn:issn:0165-0254') !== -1)
          assert(serialized.idIssn.indexOf('0165-0254') !== -1)
        })
      })
    })

    it('should have OCLC', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Deprecated URN style:
          assert(serialized.identifier.indexOf('urn:oclc:300553178') !== -1)
          assert(serialized.idOclc.indexOf('300553178') !== -1)
        })
      })
    })

    it('should have series statement', function () {
      return Bib.byId('b10610175').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.seriesStatement[0], 'Lost American fiction')
        })
      })
    })

    it('should have uniform title', function () {
      return Bib.byId('b11070917').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.uniformTitle[0], 'Works. Selections; arranged.')
        })
      })
    })

    it('should have Supplementary content', function () {
      return Bib.byId('b18932917').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.supplementaryContent[0].url, 'http://archives.nypl.org/uploads/collection/pdf_finding_aid/PSF.pdf')
          assert.equal(serialized.supplementaryContent[0].label, 'FindingAid')
        })
      })
    })

    it('should have Part of', function () {
      return Bib.byId('b12155601').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.partOf[0], 'New York (City) Museum of Modern Art. Photographs: Ballet, ca. 1900-1950. v. 38, no. 3318')
        })
      })
    })

    it('should have genreForm', function () {
      return Bib.byId('b17678033').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.genreForm[0], 'Graphic novels.')
        })
      })
    })

    it('should have publicationStatement', function () {
      return Bib.byId('b20972964').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.publicationStatement[0], '[Chilpancingo de los Bravo, México] : Guerrero, Gobierno del Estado Libre y Soberano, Secretaría de Cultura ; México, D.F. : CONACULTA : Editorial Praxis, 2015.')
        })
      })
    })

    it('should parse bf:note blanknodes correctly', function () {
      return Bib.byId('b18064236').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // This property has changed its indexed property over time, so make
          // sure we're reading the right ES property:
          let prop = bibFieldMapper.getMapping('Note').indexPropertyName || bibFieldMapper.getMapping('Note').jsonLdKey

          assert(serialized[prop])
          assert.equal(serialized[prop].length, 9)

          assert.equal(serialized[prop][0].noteType, 'Note')
          assert.equal(serialized[prop][0].label, 'Dolby 2.0; anamorphic widescreen format.')
          assert.equal(serialized[prop][8].noteType, 'Source')
          assert.equal(serialized[prop][8].label, 'American Masters, Thirteen/WNET.')
        })
      })
    })

    it('should parse "Dates of serial publication" (serialPublicationDates)', function () {
      return Bib.byId('b10018031').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.serialPublicationDates)
          assert.equal(serialized.serialPublicationDates.length, 1)
          assert.equal(serialized.serialPublicationDates[0], 'no   -313;   -mai 29/juin 5, 1978.')
        })
      })
    })

    it('should extract identifier entities', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.identifier.filter((ident) => ident.type === 'bf:Lccn' && ident.value === '   79906697').length === 0)
        })
      })
    })

    it('should parse "Former title"', function () {
      return Bib.byId('b11076048').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.formerTitle)
          assert.equal(serialized.formerTitle.length, 7)
          assert.equal(serialized.formerTitle[0], 'Arctic advance 1943')
          assert.equal(serialized.formerTitle[6], 'What price rats? 1945')
        })
      })
    })

    it('should parse "Contents" & "Contents title"', function () {
      return Bib.byId('b11055155').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Should store TOC entries in 'tableOfContents' property in same
          // order extracted:
          assert(serialized.tableOfContents)
          assert.equal(serialized.tableOfContents.length, 8)
          assert.equal(serialized.tableOfContents[0], '[v. ] 1 The Theban necropolis.')
          assert.equal(serialized.tableOfContents[1], '[v. ] 2. Theban temples.')
          assert.equal(serialized.tableOfContents[7], '[v. ] 8. Objects of provenance not known. pt. 1. Royal Statues. private Statues (Predynastic to Dynasty XVII) -- pt. 2. Private Statues (Dynasty XVIII to the Roman Periiod). Statues of Deities -- [pt. 3] Indices to parts 1 and 2, Statues -- pt. 4. Stelae (Dynasty XVIII to the Roman Period) 803-044-050 to 803-099-990 / by Jaromir Malek, assisted by Diana Magee and Elizabeth Miles.')

          // We should also find related 'contentsTitle' properties (for title
          // matching)
          assert(serialized.contentsTitle)
          assert.equal(serialized.contentsTitle.length, 8)
          assert.equal(serialized.contentsTitle[0], 'The Theban necropolis.')
          assert.equal(serialized.contentsTitle[1], 'Theban temples.')
          assert.equal(serialized.contentsTitle[7], 'Objects of provenance not known. Royal Statues. private Statues (Predynastic to Dynasty XVII) -- Private Statues (Dynasty XVIII to the Roman Periiod). Statues of Deities -- Indices to parts 1 and 2, Statues -- Stelae (Dynasty XVIII to the Roman Period) 803-044-050 to 803-099-990 /')
        })
      })
    })

    it('should extract parallel title', function () {
      return Bib.byId('b19683865').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(typeof serialized, 'object')
          assert.equal(typeof bib, 'object')
          assert.equal(bib.constructor.name, 'Bib')

          assert(serialized.parallelTitle)
          assert.equal(serialized.parallelTitle.length, 1)
          assert.equal(serialized.parallelTitle[0], '\u200F\u0643\u062A\u0627\u0628 \u0627\u0644\u0627\u0635\u0646\u0627\u0645 /')
        })
      })
    })

    it('should extract parallel title display', function () {
      return Bib.byId('b19683865').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.parallelTitleDisplay)
          assert.equal(serialized.parallelTitleDisplay.length, 1)
          assert.equal(serialized.parallelTitleDisplay[0], '\u200F\u0643\u062A\u0627\u0628 \u0627\u0644\u0627\u0635\u0646\u0627\u0645 / \u0639\u0646 \u0627\u0628\u064A \u0627\u0644\u0645\u0646\u0630\u0631 \u0647\u0634\u0627\u0645 \u0628\u0646 \u0645\u062D\u0645\u062F \u0628\u0646 \u0627\u0644\u0633\u0627\u064A\u0628 \u0627\u0644\u0643\u0644\u0628\u064A, \u0637\u0628\u0642\u0627 \u0644\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0648\u062D\u064A\u062F\u0629 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0628\u0627\u0644\u062E\u0632\u0627\u0646\u0629 \u0627\u0644\u0632\u0643\u064A\u0629 \u061B \u0628\u062A\u062D\u0642\u064A\u0642 \u0627\u062D\u0645\u062F \u0632\u0643\u064A.')
        })
      })
    })

    it('it should extract parallel series statement', function () {
      return Bib.byId('b19683865').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.parallelSeriesStatement)
          assert.equal(serialized.parallelSeriesStatement.length, 1)
          assert.equal(serialized.parallelSeriesStatement[0], '\u200F\u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u061B 21. \u062A\u062D\u0642\u064A\u0642 \u0627\u0644\u062A\u0631\u0627\u062B \u0627\u0644\u0639\u0631\u0628\u064A \u061B 7. \u0627\u062F\u0628 \u061B 12')
        })
      })
    })

    it('should extract other parallel fields', () => {
      return Bib.byId('bParallels').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          const expectedParallelDisplayField = [
            {
              fieldName: 'publicationStatement',
              index: 1,
              value: ' '
            },
            {
              fieldName: 'publicationStatement',
              index: 1,
              value: ' '
            },
            {
              fieldName: 'publicationStatement',
              index: 1,
              value: ' '
            },
            {
              fieldName: 'publicationStatement',
              index: 1,
              value: ' '
            },
            {
              fieldName: 'publicationStatement',
              index: 2,
              value: 'Parallel Place 1'
            },
            {
              fieldName: 'publicationStatement',
              index: 5,
              value: 'Parallel Place 4'
            },
            {
              fieldName: 'publicationStatement',
              index: 6,
              value: 'Parallel Place 5'
            },
            {
              fieldName: 'publicationStatement',
              index: 0,
              value: '长沙市 : 湖南人民出版社 : 湖南省新華書店发行, 1982.'
            },
            { fieldName: 'editionStatement', index: 0, value: ' ' },
            { fieldName: 'note', index: 0, value: ' ' },
            { fieldName: 'placeOfPublication', index: 1, value: ' ' },
            { fieldName: 'placeOfPublication', index: 1, value: ' ' },
            { fieldName: 'placeOfPublication', index: 1, value: ' ' },
            { fieldName: 'placeOfPublication', index: 1, value: ' ' },
            {
              fieldName: 'placeOfPublication',
              index: 2,
              value: 'Parallel Place 1'
            },
            {
              fieldName: 'placeOfPublication',
              index: 5,
              value: 'Parallel Place 4'
            },
            {
              fieldName: 'placeOfPublication',
              index: 6,
              value: 'Parallel Place 5'
            },
            {
              fieldName: 'placeOfPublication',
              index: 0,
              value: '长沙市 :'
            }
          ]
          assert.deepEqual(expectedParallelDisplayField, serialized.parallelDisplayField)
        })
      })
    })

    it('should parse donor', function () {
      return Bib.byId('b1234567').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.donor)
          assert.equal(serialized.donor.length, 1)
          assert.equal(serialized.donor[0], 'Mock Donor')
        })
      })
    })

    it('should add idOclc for identifiers with type "nypl:Oclc" on NYPL bibs', function () {
      return Bib.byId('b10011745').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.idOclc.indexOf('4131153') >= 0)
        })
      })
    })

    it('should add idOclc for identifiers with type "nypl:Oclc" on partner bibs', function () {
      return Bib.byId('hb990049360620203941').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert(serialized.idOclc.indexOf('31447739') >= 0)
        })
      })
    })
  })

  describe('items', function () {
    it('should have holding location', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].holdingLocation[0].id, 'loc:rc2ma')
          assert.equal(serialized.items[0].holdingLocation[0].label, 'Offsite')
        })
      })
    })

    it('should have recap customer code', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].recapCustomerCode[0], 'abc')
        })
      })
    })

    it('should have catalog item type', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].catalogItemType[0].id, 'catalogItemType:55')
          assert.equal(serialized.items[0].catalogItemType[0].label, 'book, limited circ, MaRLI')
        })
      })
    })

    it('should have lots of identifiers', function () {
      return Bib.byId('b10001936').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Deprecated URN style:
          assert(serialized.items[0].identifier.indexOf('urn:barcode:33433001892276') >= 0)
          // Confirm copied to special idBarcode field:
          assert(serialized.items[0].idBarcode.indexOf('33433001892276') >= 0)
        })
      })
    })

    it('should have status', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].status[0].id, 'status:a')
          assert.equal(serialized.items[0].status[0].label, 'Available')
        })
      })
    })

    it('should have requestable', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal((typeof serialized.items[0].requestable[0]), 'boolean')
        })
      })
    })

    it('should have access message', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].accessMessage[0].id, 'accessMessage:2')
          assert.equal(serialized.items[0].accessMessage[0].label, 'Request in advance')
        })
      })
    })

    it('should have electronic resource fields', function () {
      return Bib.byId('b10011374').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Grab electronic item from among many other non-electronic items:
          var electronicItem = serialized.items.filter((item) => item.uri === 'i10011374-e').pop()

          // Check first and last electronicLocators properties:
          assert.equal(electronicItem.electronicLocator[0].url, 'http://hdl.handle.net/2027/nyp.33433057532081')
          assert.equal(electronicItem.electronicLocator[0].label, 'Full text available via HathiTrust--v. 1')
          assert.equal(electronicItem.electronicLocator[3].url, 'http://hdl.handle.net/2027/nyp.33433067332555')
          assert.equal(electronicItem.electronicLocator[3].label, 'Full text available via HathiTrust--v. 2')
        })
      })
    })

    it('should have expected nypl owner', function () {
      return Bib.byId('b19834195').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].owner[0].id, 'orgs:1002')
          assert.equal(serialized.items[0].owner[0].label, 'New York Public Library for the Performing Arts, Dorothy and Lewis B. Cullman Center')
        })
      })
    })

    it('should have expected PUL owner', function () {
      return Bib.byId('pb176961').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].owner[0].id, 'orgs:0003')
          assert.equal(serialized.items[0].owner[0].label, 'Princeton University Library')
        })
      })
    })

    it('should be ordered correctly', function () {
      return Bib.byId('b19834195').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // Ensure first item is Box 1
          assert.equal(serialized.items[0].shelfMark[0], '*T-Mss 1991-010 Box 1')
          assert.equal(serialized.items[1].shelfMark[0], '*T-Mss 1991-010 Box 2')
          assert.equal(serialized.items[9].shelfMark[0], '*T-Mss 1991-010 Box 10')

          // Ensure last item is Tube 70
          assert.equal(serialized.items[serialized.items.length - 1].shelfMark[0], '*T-Mss 1991-010 Tube 70')
        })
      })
    })

    it('should include itypes 132', function () {
      // Note: Other itypes > 100 that should be indexed include 133, 134, 135, & 142
      return Bib.byId('b17655587').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // This bib has 6 items at writing. Four are suppressed by icode2 rules.
          // Two have itype 132 and should not be suppressed
          // Confirm the bib has them:
          let itemsWithHighItype = serialized.items.filter((item) => item.catalogItemType[0].id === 'catalogItemType:132')
          assert(itemsWithHighItype.length > 0)
        })
      })
    })

    it('should set physicalLocation and enumerationChronology fields', () => {
      return Bib.byId('b19834195').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.strictEqual(serialized.items[29].physicalLocation[0], '*T-Mss 1991-010')
          assert.strictEqual(serialized.items[29].enumerationChronology[0], 'Box 30')
        })
      })
    })

    describe('Aeon', function () {
      it('should set aeonUrl on bib with one item', () => {
        return Bib.byId('b11793485').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.strictEqual(serialized.items[0].aeonUrl[0], 'https://specialcollections.nypl.org/aeon/Aeon.dll?Action=10&Form=30&Title=[Vocal+and+instrumental+music+/&Site=SCHMA&CallNumber=Sc+Scores+Waller&Author=Waller,+Fats,&Date=1924-1955.&ItemInfo3=https://nypl-sierra-test.nypl.org/record=b117934859&ReferenceNumber=b117934859&ItemInfo1=USE+IN+LIBRARY&ItemISxN=i332995847&Genre=Score&Location=Schomburg+Center')
          })
        })
      })

      it('should not add aeonUrl to items with invalid 856', () => {
        return Bib.byId('b11793485-invalid-856').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.items[0].aeonUrl, null)
          })
        })
      })

      it('should set aeonUrl on bib with 3 items, one of which is special coll', () => {
        return Bib.byId('b11574666').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.strictEqual(serialized.items[0].aeonUrl[0], 'https://specialcollections.nypl.org/aeon/Aeon.dll?Action=10&Form=30&Title=The+problem+of+human+destiny++or,+The+end+of+Providence+in+the+world+and+man,&Site=SCHRB&CallNumber=Sc+Rare+124-D+(Dewey,+O.+Problem+of+human+destiny)&Author=Dewey,+Orville,&ItemPlace=New+York,&ItemPublisher=J.+Miller,&Date=1864.&ItemInfo3=https://nypl-sierra-test.nypl.org/record=b115746663&ReferenceNumber=b115746663&ItemInfo1=USE+IN+LIBRARY&ItemNumber=33433034100226&ItemISxN=i103641531&Genre=Book-text&Location=Schomburg+Center')
            assert.strictEqual(serialized.items[0].uri, 'i10364153')
            assert.equal(serialized.items[1].aeonUrl, null)
            assert.strictEqual(serialized.items[1].uri, 'i15002628')
            assert.equal(serialized.items[2].aeonUrl, null)
            assert.strictEqual(serialized.items[2].uri, 'i28230569')
            assert.strictEqual(serialized.items.length, 4)
          })
        })
      })

      it('should set aeonUrl on bib dev aeon base url', () => {
        return Bib.byId('b11793485-dev-aeon-base-url').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.strictEqual(serialized.items[0].aeonUrl[0], 'https://aeon-test-domain.com/aeon/Aeon.dll?Action=10&Form=30&Title=[Vocal+and+instrumental+music+/&Site=SCHMA&CallNumber=Sc+Scores+Waller&Author=Waller,+Fats,&Date=1924-1955.&ItemInfo3=https://nypl-sierra-test.nypl.org/record=b117934859&ReferenceNumber=b117934859&ItemInfo1=USE+IN+LIBRARY&ItemISxN=i332995847&Genre=Score&Location=Schomburg+Center')
          })
        })
      })

      it('should not set aeonUrl if no URL found in bib', () => {
        return Bib.byId('b11793485-no-aeon-url-in-bib').then((bib) => {
          return ResourceSerializer.serialize(bib).then((serialized) => {
            assert.equal(serialized.items[0].aeonUrl, null)
          })
        })
      })
    })
  })

  describe('holdings', () => {
    let testBib
    before((done) => {
      Bib.byId('b11254422').then((bib) => {
        ResourceSerializer.serialize(bib).then((serialBib) => {
          testBib = serialBib
          done()
        })
      })
    })

    it('should have a shelfMark', () => {
      assert.equal(testBib.holdings[0].shelfMark, 'MFWA+ 89-1277')
    })

    it('should include multiple HoldingStatements', () => {
      assert.equal(testBib.holdings[0].holdingStatement[0], '27(1988)-40:156(2020)-')
      assert.equal(testBib.holdings[0].holdingStatement[1], 'no. 3840 (2018/2020)')
    })

    it('should include location fields', () => {
      assert.equal(testBib.holdings[0].location[0].code, 'loc:rc2ma')
      assert.equal(testBib.holdings[0].location[0].label, 'Offsite')
    })

    it('should have a format', () => {
      assert.equal(testBib.holdings[0].format[0], '{"PRINT"}')
    })

    it('should contain an array of ordered checkInBoxes', () => {
      const firstBox = testBib.holdings[0].checkInBoxes[0]
      const lastBox = testBib.holdings[0].checkInBoxes[testBib.holdings[0].checkInBoxes.length - 1]

      assert.equal(firstBox.coverage, '37:143 (2017--)')
      assert.equal(firstBox.status, 'Arrived')
      assert.equal(firstBox.copies, null)
      assert.equal(firstBox.position, '1')
      assert.equal(firstBox.shelfMark, 'MFWA+ 89-1277')

      assert.equal(lastBox.coverage, '40:157 (2020--)')
      assert.equal(lastBox.status, 'Expected')
      assert.equal(lastBox.copies, null)
      assert.equal(lastBox.position, '15')
      assert.equal(lastBox.shelfMark, 'MFWA+ 89-1277')
    })
  })

  describe('item order', function () {
    let bib

    before(() => {
      Bib.byId('b11055155_with_missing_shelfMarks').then((res) => {
        ResourceSerializer.serialize(res).then((serialized) => { bib = serialized })
      })
    })

    it('ResourceSerializer.zeroPadString should zero pad a string', function () {
      assert.equal(ResourceSerializer.zeroPadString('78'), '000078')
    })

    it('ResourceSerializer.sortableShelfMark zero-pads numbers at end of string', function () {
      let sortable = ResourceSerializer.sortableShelfMark

      // Test numbers that *terminate* a call number:
      assert.equal(sortable('T-Mss 1991-010 27'), 'T-Mss 1991-010 000027')
      assert.equal(sortable('T-Mss 1991-010 70'), 'T-Mss 1991-010 000070')
    })

    it('ResourceSerializer.sortableShelfMark makes sortable vol/reel/box/tube numbers wherever they appear', function () {
      let sortable = ResourceSerializer.sortableShelfMark

      // Test numbers that appear anywhere within a call number:
      // Test box/Box/BOX:
      assert.equal(sortable('Map Div. 98­914    Box 9, Fj­Ga'), 'Map Div. 98­914 box 000009, Fj­Ga')
      assert.equal(sortable('Map Div. 98­914    box 9, Fj­Ga'), 'Map Div. 98­914 box 000009, Fj­Ga')
      assert.equal(sortable('Map Div. 98­914    BOX 9, Fj­Ga'), 'Map Div. 98­914 box 000009, Fj­Ga')

      assert.equal(sortable('Map Div. 98­914    Box 8, E­Fi'), 'Map Div. 98­914 box 000008, E­Fi')
      assert.equal(sortable('Map Div. 98­914  Box 17, Mp­O'), 'Map Div. 98­914 box 000017, Mp­O')
      // Box 8 should precede Box 25:
      assert(sortable('Map Div. 98­914    Box 8, E­Fi') < sortable('Map Div. 98­914    Box 25, Wi­Z'))
      // Confirm the whitespace collapse causes Box 25 to follow box 17 regardless of whitespace:
      assert(sortable('Map Div. 98­914    Box 25, Wi­Z') > sortable('Map Div. 98­914  Box 17, Mp­O'))

      assert.equal(sortable('Map Div. 98­914    v. 8, E­Fi'), 'Map Div. 98­914 v. 000008, E­Fi')
      assert.equal(sortable('Map Div. 98­914    TUBE 8, E­Fi'), 'Map Div. 98­914 tube 000008, E­Fi')
      assert.equal(sortable('Map Div. 98­914    No. 8, E­Fi'), 'Map Div. 98­914 no. 000008, E­Fi')
      assert.equal(sortable('Map Div. 98­914    r. 8, E­Fi'), 'Map Div. 98­914 r. 000008, E­Fi')
    })

    it('should applyDefaultShelfMark', () => {
      assert(bib.items.every((item) => (item.shelfMark && item.shelfMark.length) || item.electronicLocator))
      assert(bib.items.every((item) => !(item.shelfMark && item.electronicLocator)))
    })

    it('should applySortableShelfMark', () => {
      assert(bib.items.every((item) => item.shelfMark_sort))
    })

    it('should sort by shelfMark_sort', () => {
      assert(bib.items.every((item, idx) => { return !bib.items[idx + 1] || (item.shelfMark_sort < bib.items[idx + 1].shelfMark_sort) }))
    })

    describe('applySortableShelfMark', () => {
      it('should put items with shelfMark first', () => {
        assert(bib.items.slice(0, 8).every((item) => item.shelfMark && item.shelfMark.length))
      })

      it('should sort items with shelfMark by shelfMark', () => {
        let itemsWithShelfMark = bib.items.slice(0, 8)
        assert(itemsWithShelfMark.every((item, i) => {
          if (i === 7) return true
          return item.shelfMark[0] < itemsWithShelfMark[i + 1].shelfMark[0]
        }))
      })

      it('should sort items with no shelf mark by id', () => {
        let itemsWithOutShelfMark = bib.items.slice(8, 11)
        assert(itemsWithOutShelfMark.every((item, i) => {
          if (i === 2) return true
          return item.uri < itemsWithOutShelfMark[i + 1].uri
        }))
      })
    })
  })

  describe('item dueDate', () => {
    it('handles missing dueDate', () => {
      return Bib.byId('b10001936')
        .then(ResourceSerializer.serialize)
        .then((bib) => {
          const item = bib.items[0]

          expect(item.dueDate).to.be.a('undefined')
        })
    })

    it('handles set dueDate', () => {
      return Bib.byId('bib-having-item-with-duedate')
        .then(ResourceSerializer.serialize)
        .then((bib) => {
          const item = bib.items[0]

          expect(item.dueDate).to.be.a('array')
          expect(item.dueDate[0]).to.equal('2022-09-26')
        })
    })
  })
})
