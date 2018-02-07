const catalogItemTypeMapping = require('@nypl/nypl-core-objects')('by-catalog-item-type')
const Base = require('./base')
const db = require('../db')

class Item extends Base {
  /*
   * Returns true if this item is considered a 'Research' item, which will be
   * true if:
   *
   *   * It's a partner record OR
   *   * It's a generated electronic record:
   *   * Its itype's collectionType includes 'Research'
   *
   * The determination made here doesn't directly control whether or not an
   * item is indexed. An item will be indexed if it is not `suppressed`,
   * which is established upstream in the `pcdm-store-updater`. The check
   * performed here exists solely to determine whether the parent Bib is
   * 'Research', which will be true if it has at least one Item that is
   * considered 'Research'
   */
  isResearch () {
    // We know it's a partner item if its id starts in p[ul] or c[ul]:
    const isPartnerItem = /^[pc]/.test(this.uri)

    // We know it's a generated electronic item if it has a bf:electronicLocator predicate:
    const isElectronicItem = this.literal('bf:electronicLocator')

    // Check catalogItemTypes json-ld vocab to see if itype's collectionTypes includes 'Research':
    let itype = this.objectId('nypl:catalogItemType')
    // Strip namespace from id:
    if (itype) itype = itype.split(':').pop()
    const itypeIsResearch = itype &&
      catalogItemTypeMapping[itype] &&
      catalogItemTypeMapping[itype].collectionType.indexOf('Research') >= 0

    return isPartnerItem || isElectronicItem || itypeIsResearch
  }
}

Item.byId = (id) => {
  return db.getStatements('resource', id).then((s) => new Item(s))
}

Item.fromStatements = (stmts) => {
  var doc = new Item(stmts.map((s) => ({ subject_id: s.s, predicate: s.pr, object_id: s.id, object_literal: s.li, object_label: s.la })))
  doc.uri = stmts[0].s
  return doc
}

module.exports = Item
