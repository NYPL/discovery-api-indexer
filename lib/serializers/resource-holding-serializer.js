'use strict'

const holdingFieldMapper = require('./../field-mapper')('holding')
const log = require('loglevel')
const EsSerializer = require('./es-serializer')

class ResourceHoldingSerializer extends EsSerializer {
  serialize () {
    const fieldMapping = holdingFieldMapper

    // Block suppressed and deleted holdings
    if (this.object.literal(fieldMapping.predicateFor('Suppressed')) === 'true') {
      log.info('Suppressed/Deleted records should not be serialized')
      return null
    }

    this.statements.uri = this.object.uri

    // Add Basic literal fields
    ; [ 'Format', 'Note', 'Physical Location', 'Holding Statement' ].forEach((name) => {
      holdingFieldMapper.getMapping(name, (spec) => {
        this.object.each(spec.pred, (triple) => {
          this.addStatement(spec.jsonLdKey, triple.object_literal)
        })
      })
    })

    // Add call number/shelfMark as identifiers
    holdingFieldMapper.getMapping('Call Number', (spec) => {
      this.object.each(spec.pred, (triple) => {
        this.addStatement(spec.jsonLdKey, triple.object_literal)
        this.addStatement('identifierV2', { value: triple.object_literal, type: 'bf:shelfMark' })
      })
    })

    // Add fields that are labels, right now this is just location
    holdingFieldMapper.getMapping('Location', (spec) => {
      this.object.each(spec.pred, (triple) => {
        this.addStatement(spec.jsonLdKey, { label: triple.object_label, code: triple.object_id })
      })
    })

    // Add Check-In Cards which are represented as blank nodes
    holdingFieldMapper.getMapping('Check In Box', (spec) => {
      this.object.blankNodes(spec.pred, (blankNode) => {
        this.addStatement(spec.jsonLdKey, {
          type: 'nypl:CheckInBox',
          coverage: blankNode.literal('dcterms:coverage'),
          status: blankNode.literal('bf:status'),
          copies: blankNode.literal('bf:count'),
          position: blankNode.literal('bf:part')
        })
      })
    })

    return this.statements
  }
}

ResourceHoldingSerializer.serialize = (item) => (new ResourceHoldingSerializer(item)).serialize()

module.exports = ResourceHoldingSerializer
