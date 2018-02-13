# Discovery API Indexer

This app pulls data from the Discovery store (aka PCDM Store) and pushes it into one of a number of Elasticsearch indexes powering the Discovery API.

## Installation

```
npm i
```

## Usage

This app is deployed as lambda `discoveryIndexerPoster`. It can also be invoked in "bulk" mode.

### Test Events

Edit `event.unencoded.json` with your desired test ids. Then commit your changes to `event.json` using the `kinesify-data` utility as follows:

```
node kinesify-data event.unencoded.json event.json https://api.nypltech.org/api/v0.1/current-schemas/IndexDocument
```

To run the app locally against `event.json`

```
node-lambda run -f config/qa.env
```

### Deploying

1. Copy sample environment-specific by running:  `cp ./config/sample.env ./config/production.env && cp ./config/sample.env ./config/qa.env`
1. Fill in missing secrets in both environment files (talk to a coworker)
1. `npm run deploy-[qa|production]`

### Bulk Building Resources Index

**CAVEAT: The scripts in `./jobs` will need some local editing until we resolve
[issue 17](https://github.com/NYPL-discovery/discovery-api-indexer/issues/17).**

The non-lambda invocation method is provided for bulk processing. It's generally faster to use the bulk method to load millions of documents.S

To populate the index identified in `deploy.env` (described above):

`node jobs/index-resources [--threads THREADS] [--rebuild] [--disablescreen]`

This builds the given index. Optional arguments:
* `threads`: Specifies the number of concurrent threads to use. 3 is fine since any more than this risks crippling the db. (Also, the app will prevent any more than this from running concurrently as a precaution.)
* `rebuild`: If set, tells indexer to first destroy whatever index is there and re-assert the field mapping. (Useful for schema changes.)
* `disablescreen`: By default, a fancy curses-like library ([blessed-contrib](https://github.com/yaronn/blessed-contrib)) is used to visualize the progress. This has the side-effect of garbling emitted errors/debug messages. Specify `--disablescreen` to disable the fancy curses screen takeover to view all output to stdout.

Note that database & elasticsearch creds, loglevel, and nypl data api base url configuration are pulled from `deploy.env`. See lambda config notes above.

### Managing Indexes

See the [Index Administration documentation](docs/index-admin.md) for notes on Elasticsearch index creation, preparation, modification, and deletion.

## Testing

```
npm test
```

All tests rely on local fixtures. When adding new tests, a script is included for generating fixtures based on existing QA/Production data. See [jobs/update-test-fixtures.js](jobs/update-test-fixtures.js) for details.

### Updating fixtures

To update a fixture:
```
node jobs/update-test-fixtures --id b17678033 --profile [aws profile] --envfile config/[envfile name]
```
