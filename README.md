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

A few "admin" hooks are provided for index management:

To **list** all indexes in the configured Elasticsearch instance:

`node jobs/index-admin list`

To **prepare** an index (post mapping but no data):

`node jobs/index-admin prepare --index INDEX`

To **delete** an index:

`node jobs/index-admin delete --index INDEX`

Note that this will prompt you to supply an additional parameter to that command *for security*.

A note on the `list` function output:

```
node jobs/index-admin list
Indexes:
  ...
  resources-2017-01-09.2 (20684 records)
  resources-2017-01-09 > "resources" (474603 records)
  resources-2017-02-02 (2043378 records)
```

As a convenience, a single "resources" alias points to the index that is "active". In the above, `resources-2017-01-09` is the active index. In practice, one should only "activate" an index after it has finished building and only after it has been tested to work with the presently deployed [discovery-api](https://github.com/nypl-discovery/discovery-api) Note that nothing presently relies on this alias; We've experimented with using index aliases to enable zero downtime index rebuilds, but have retired that practice because it's safer to point the discovery-api at the specific best index at any given time. (Relying on an index alias means apps using that alias may not be prepared for the new target schema.)

To **activate** an index:

`node jobs/index-admin activate --index [datestamped-index-name]`

So, for example, to create an alias called 'resources' pointing to index 'resources-2017-01-09', run:

`node jobs/index-admin activate --index resources-2017-01-09`

The code assumes from the timestamped index name that the desired alias is "resources" and will unassign the "resources" alias if it already exists.

## Testing

```
npm test
```
