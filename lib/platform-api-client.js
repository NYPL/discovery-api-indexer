const NyplClient = require('@nypl/nypl-data-api-client')

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

    _instance = new NyplClient({
      base_url: process.env.NYPL_API_BASE_URL,
      oauth_key: process.env.NYPL_OAUTH_KEY,
      oauth_secret: process.env.NYPL_OAUTH_SECRET,
      oauth_url: process.env.NYPL_OAUTH_URL
    })
  }

  return _instance
}

module.exports = {
  instance
}
