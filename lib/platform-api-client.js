const NyplClient = require('@nypl/nypl-data-api-client')
const kmsHelper = require('./kms-helper')

let _instance = null

const instance = () => {
  if (!_instance) {
    // Preflight check:
    if ([
      'NYPL_API_BASE_URL',
      'NYPL_OAUTH_KEY',
      'NYPL_OAUTH_SECRET',
      'NYPL_OAUTH_URL'
    ].some((env) => !process.env[env])) {
      throw new Error('Config error: Missing platform api creds')
    }

    _instance = Promise.all([
      kmsHelper.decrypt(process.env.NYPL_OAUTH_KEY),
      kmsHelper.decrypt(process.env.NYPL_OAUTH_SECRET)
    ]).then((creds) => {
      const [decryptedKey, decryptedSecret] = creds

      return new NyplClient({
        base_url: process.env.NYPL_API_BASE_URL,
        oauth_key: decryptedKey,
        oauth_secret: decryptedSecret,
        oauth_url: process.env.NYPL_OAUTH_URL
      })
    })
  }

  return _instance
}

module.exports = {
  instance
}
