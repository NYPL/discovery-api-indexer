# Discovery API Indexer

This app pulls data from the Discovery store (aka PCDM Store) and pushes it into one of a number of Elasticsearch indexes powering the Discovery API.

## Installation

```
npm i
```

## Usage

This app is deployed as lambda `discoveryIndexerPoster`. It can also be invoked in "bulk" mode.

### Lambda Development & Deploy

To develop or run the lambda locally, first set up your node-lambda env:

```
npm install -g node-lambda
node-lambda setup
```

Ensure `deploy.env` has the following:
```
DISCOVERY_STORE_CONNECTION_URI=[encrypted rds connection string]
ELASTICSEARCH_CONNECTION_URI=[encrypted es connection string, which in plaintext could be "localhost:9200"]
ELASTIC_RESOURCES_INDEX_NAME=[name of resources index]
NYPL_API_SCHEMA_URL=[plaintext schema base url ending in '/current-schemas/']
NYPL_API_BASE_URL=[plaintext data api base url ending in, for example, '/v0.1/']
OUTGOING_STREAM_NAME=[name of kinesis stream to write to, e.g. "IndexDocumentProcessed-development"]
OUTGOING_SCHEMA_NAME=[name of avro schema to encode outgoing messages against, e.g. "IndexDocumentProcessed"]
LOGLEVEL=info
```

Similarly, `.env` should minimally have:
```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_PROFILE=
AWS_SESSION_TOKEN=
AWS_ROLE_ARN=arn:aws:iam::224280085904:role/lambda_basic_execution
AWS_REGION=us-east-1
AWS_FUNCTION_NAME=discoveryIndexPoster
AWS_HANDLER=document-stream-listener.handler
AWS_MEMORY_SIZE=512
AWS_TIMEOUT=30
AWS_DESCRIPTION=
AWS_RUNTIME=nodejs6.10
AWS_VPC_SUBNETS=subnet-f4fe56af
AWS_VPC_SECURITY_GROUPS=sg-1d544067
EXCLUDE_GLOBS="event.json"
PACKAGE_DIRECTORY=build
AWS_ROLE_ARN=...
AWS_REGION=...
```

Edit `event.unencoded.json` with your desired test ids. Then commit your changes to `event.json` using the `kinesify-data` utility as follows:

```
node kinesify-data event.unencoded.json event.json https://api.nypltech.org/api/v0.1/current-schemas/IndexDocument
```

To run the app locally against `event.json`

```
node-lambda run -f deploy.env
```

To *deploy* to an existing Lambda like:

```
node-lambda deploy -f deploy.env
```

This will deploy to a Lambda called "discoveryIndexPoster". Add a Kinesis stream trigger to execute function if not already added.

### Bulk Building Resources Index

The non-lambda invocation method is provided for bulk processing. It's generally faster to use the bulk method to load millions of documents.

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
