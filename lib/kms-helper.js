const AWS = require('aws-sdk')
const log = require('loglevel')

function decrypt (encrypted) {
  return new Promise((resolve, reject) => {
    const kms = new AWS.KMS()
    kms.decrypt({ CiphertextBlob: Buffer.from(encrypted, 'base64') }, (err, data) => {
      if (err) return reject(err)

      const decrypted = data.Plaintext.toString('ascii')
      log.debug('KmsHelper: Successully decrypted value')
      resolve(decrypted)
    })
  })
}

function decryptDbCreds () {
  if (!process.env.DISCOVERY_STORE_CONNECTION_URI) throw new Error('Missing DISCOVERY_STORE_CONNECTION_URI env variable; aborting.')

  const encrypted = process.env.DISCOVERY_STORE_CONNECTION_URI
  return decrypt(encrypted)
}

function decryptElasticCreds () {
  if (!process.env.ELASTICSEARCH_CONNECTION_URI) throw new Error('Missing ELASTICSEARCH_CONNECTION_URI env variable; aborting.')

  const encrypted = process.env.ELASTICSEARCH_CONNECTION_URI
  return decrypt(encrypted)
}

module.exports = { decryptDbCreds, decryptElasticCreds, decrypt }
