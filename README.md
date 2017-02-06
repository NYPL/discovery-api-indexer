# Discovery API Indexer

This app pulls data from the Discovery store (aka PCDM Store) and pushes it into one of a number of Elasticsearch indexes powering the Discovery API.

## Usage

The indexer currently has the ability to build and manage resources indexes. Note that you'll first need to create a `config/local.json` to override the meaningless config defaults.

### Building Resources Index

```node jobs/index-resources [--threads THREADS] [--index INDEX] [--rebuild] [--disablescreen]```

This builds the given index. Optional arguments:
* `threads`: Specifies the number of concurrent threads to use. 3 is fine since any more than this risks crippling the db. (Also, the app will prevent any more than this from running concurrently as a precaution.)
* `index`: Specifies the index to write to. This overrides `elasticsearch.indexes.resources` in config/*.json
* `rebuild`: If set, tells indexer to first destroy whatever index is there and re-assert the field mapping. (Useful for schema changes.)
* `disablescreen`: By default, a fancy curses-like library ([blessed-contrib](https://github.com/yaronn/blessed-contrib)) is used to visualize the progress. This has the side-effect of garbling emitted errors/debug messages. Specify `--disablescreen` to disable the fancy curses screen takeover to view all output to stdout.

### Managing Indexes

To **list** all indexes in the configured Elasticsearch instance:

```node jobs/index-admin list```

To **delete** an index:

```node jobs/index-admin delete --index INDEX```

Note that this will prompt you to supply an additional parameter to that command *for security*.

We use Elasticsearch index aliases to enable zero-downtime rebuilds. This means that at any given time there may be a handful of "resources" indexes with timestamped names:

```
node jobs/index-admin list
Indexes: 
  ...
  resources-2017-01-09.2 (20684 records)
  resources-2017-01-09 > "resources" (474603 records)
  resources-2017-02-02 (2043378 records)
```

A single "resources" alias points to the index that is "active". In the above, `resources-2017-01-09` is the active index. In practice, one should only "activate" an index after it has finished building and only after it has been tested to work with the presently deployed [discovery-api](https://github.com/nypl-discovery/discovery-api)

To **activate** an index:

```node jobs/index-admin activate --index [datestamped-index-name]```

So, for example, to create an alias called 'resources' pointing to index 'resources-2017-01-09', run:

```node jobs/index-admin activate --index resources-2017-01-09```

The code assumes from the timestamped index name that the desired alias is "resources" and will unassign the "resources" alias if it already exists.