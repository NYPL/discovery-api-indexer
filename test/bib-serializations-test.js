/* global describe it before after */

const assert = require('assert')
const sinon = require('sinon')
const path = require('path')
const fs = require('fs')

const ResourceSerializer = require('../lib/es-serializer').ResourceSerializer
const DiscoveryStoreModels = require('discovery-store-models')
const { Bib } = DiscoveryStoreModels

process.env.LOGLEVEL = process.env.LOGLEVEL || 'error'

const bibFieldMapper = require('../lib/field-mapper')('bib')

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

function init () {
  sinon.stub(Bib, 'byId').callsFake(getBibByFixture)
}

function destroy () {
  Bib.byId.restore()
}

describe.only('Bib Serializations', function () {
  this.timeout(5000)

  before(init)

  after(destroy)

  describe('bibs', function () {
    it('should have title', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.title[0], 'Victor Pasmore : a catalogue raisonné of the paintings, constructions, and graphics, 1926-1979')
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

    it('should have subject literal', function () {
      return Bib.byId('b11253008').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.subjectLiteral[0], 'African American fashion designers -- Interviews.')
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
          ; [
            'urn:bnum:11253008'
            // TODO These used to be set for this bib, buit no longer found (i.e. 050, 010)
            // 'urn:lcc:CT1919.P38',
            // 'urn:lccCoarse:CT210-3150',
            // 'urn:oclc:71217073'
          ].forEach((identifier) => {
            assert(serialized.identifier.indexOf(identifier) >= 0)
          })
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

    it('should have lcc classification', function () {
      return Bib.byId('b10681848').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.lccClassification[0], 'N6797.P3 A4 1980')
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

          assert.equal(serialized[prop][0].noteType, 'General Note')
          assert.equal(serialized[prop][0].label, 'Publication date from cover.')
          assert.equal(serialized[prop][1].noteType, 'Bibliography, etc. Note')
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
          assert(serialized.identifier.indexOf('urn:lccn:   79906697') !== -1)
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

    it('should parse bf:note blanknodes correctly', function () {
      return Bib.byId('b18064236').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          // This property has changed its indexed property over time, so make
          // sure we're reading the right ES property:
          let prop = bibFieldMapper.getMapping('Note').indexPropertyName || bibFieldMapper.getMapping('Note').jsonLdKey

          assert(serialized[prop])
          assert.equal(serialized[prop].length, 9)

          assert.equal(serialized[prop][0].noteType, 'General Note')
          assert.equal(serialized[prop][0].label, 'Dolby 2.0; anamorphic widescreen format.')
          assert.equal(serialized[prop][8].noteType, 'Immediate Source of Acquisition Note')
          assert.equal(serialized[prop][8].label, 'American Masters, Thirteen/WNET.')
        })
      })
    })
  })

  describe('items', function () {
    it('should have holding location', function () {
      return Bib.byId('b10781594').then((bib) => {
        return ResourceSerializer.serialize(bib).then((serialized) => {
          assert.equal(serialized.items[0].holdingLocation[0].id, 'loc:rc2ma')
          assert.equal(serialized.items[0].holdingLocation[0].label, 'OFFSITE - Request in Advance')
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
          ; [
            'urn:barcode:33433001892276'
          ].forEach((identifier) => {
            assert(serialized.items[0].identifier.indexOf(identifier) >= 0)
          })
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
          assert.equal(serialized.items[0].accessMessage[0].label, 'ADV REQUEST')
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
  })
})
