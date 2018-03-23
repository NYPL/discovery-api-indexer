const envConfigHelper = require('../../lib/env-config-helper')
const index = require('../../lib/index')

before(function () {
  process.env.ELASTIC_RESOURCES_INDEX_NAME = process.env.ELASTIC_RESOURCES_INDEX_NAME || 'resources-test-index'

  // Initialize connections
  return envConfigHelper.init({ index })
})

