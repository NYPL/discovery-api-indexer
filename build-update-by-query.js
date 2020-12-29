const fs = require('fs')

const result = {
  'script': {
    'inline': fs.readFileSync(process.argv[2], 'utf8'),
    'lang': 'painless'
  },
  'query': {
  }
}

console.log(JSON.stringify(result, null, 2))
