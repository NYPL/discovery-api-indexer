# Discovery API Indexer

This app pulls data from the Discovery store (aka PCDM Store) and pushes it into the Elasticsearch index that powers the Discovery API.

## Installation

```
npm i
```

## Usage

This app is deployed as lambda `DiscoveryIndexerPoster-[env]`. It can also be invoked in "bulk" mode.

Note that when developing locally, you may need to [add your IP to the access control policy of the relevant ES domain](https://github.com/NYPL/aws/blob/b5c0af0ec8357af9a645d8b47a5dbb0090966071/common/elasticsearch.md#2-make-the-domain-public-restrict-by-ip).

### Test Events

Edit `event.unencoded.json` with your desired test ids. Then commit your changes to `event.json` using the `kinesify-data` utility as follows:

```
node kinesify-data event.unencoded.json
```

To run the app locally against `event.json`

```
node-lambda run -f config/qa.env
```

### Updating a single record

To update a specific bib or item, you have options:

#### 1. Re-play updates by queuing up index jobs directly in the `IndexDocument` stream

Use the [nypl-streams-client CLI](https://github.com/NYPL-discovery/node-nypl-streams-client#cli) to write IndexDocument events:

```
cli/nypl-streams.js --envfile config/qa.env --profile nypl-digital-dev write IndexDocument-qa --schemaName IndexDocument '{ "uri": "b12082323", "type": "record" }'
```

The above queues a reindex job for bib b12082323 - exactly as happens when the bib or any of its items are processed by the [DiscoveryStorePoster](https://github.com/NYPL-discovery/discovery-store-poster) after writing statements to the store.

This option is preferred because it uses the deployed infrastructure to do all the work and doesn't rely on local config. It is also the fastest because it triggers the update as far downstream as possible without bothering the Bib/Item Services.

#### 2. Re-play updates from the BibService

Use the [bib-post-request endpoint](https://platformdocs.nypl.org/#/bibs/createBibPostRequest)

Optionally, use [bib-item-post-request-runner](https://github.com/NYPL/bib-item-post-request-runner), which provides easy CLI access to above.

This option is best when:
 * you're re-indexing *all* bibs and items, or
 * you suspect the DiscoveryStore may not have all necessary data, or
 * the set of documents you want to update are defined by specific update timestamps

#### 3. Manually update the record from local code and config

A script is provided to manually run the indexer locally against a given bnum:

```
node jobs/index-resources.js --bnum [bnum] --envfile [local env file] --profile [aws profile]
```

For example, the following will re-index bib "b18932917" from the QA db into the QA ES index using NYPL-Core version 1.7a:

```
NYPL_CORE_VERSION=v1.7a node jobs/index-resources.js --uri b18932917 --envfile config/qa.env --profile nypl-sandbox
```

This option is best when you want to test writing specific documents to the dev/qa index using local field mapping changes (i.e. that are not yet deployed) to verify the resulting documents behave correctly in queries.

### Bulk Building Resources Index

The non-lambda invocation method is provided for bulk processing. It's generally faster to use the bulk method to load millions of documents.S

To populate the index identified in `deploy.env` (described above):

`node jobs/index-resources [--threads THREADS] [--rebuild] [--disablescreen] --envfile [local env file] --profile [aws profile]`

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

## Contributing

This repo follows a [git workflow](https://github.com/NYPL/engineering-general/blob/master/standards/git-workflow.md#prs-target-main-merge-to-deployment-branches) where PRs are cut from `main` and then `main` is merged into each deployment branch.

### Deploying

This repo is not directly deployed as a Lambda. It is brought in as a module in [DiscoveryHybridIndexer](https://github.com/NYPL/discovery-hybrid-indexer). After your PR has been approved and merged to `main`:
 * Bump the `version` in this app's `package.json`
 * Run `git tag -a v1.0.2` (or whatever the new version is)
 * `git push --tags`
 * Create a PR that edits the [discovery-hybrid-indexer](https://github.com/NYPL/discovery-hybrid-indexer)'s `package.json` to use the new version of `discovery-api-indexer`
