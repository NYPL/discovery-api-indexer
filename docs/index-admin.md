# Index Administration

This document describes a few dangerous operations one can make on Elastic indexes.

## Modifying an index mapping

If the modification strictly *adds* mappings, one can *normally do that by `PUT`ing the mapping to the index:

```
# PUT this to https://[FQDN]/[index name]/_mapping/[document type]
{
  "properties": {
    "genreForm": {
      "type": "text",
      "fields": {
        "keyword": {
          "type": "keyword",
          "ignore_above": 256
        }
      }
    }
  }
}
```

As another example, to create a un-indexed, 'keyword' typed mapping for `serialPublicationDates`, issue a `PUT` to "https://[fqdn index]/[current index name]/_mapping/resource" with the following raw body:
```
{
  "properties": {
    "serialPublicationDates": {
      "index": false,
      "type": "keyword"
    }
  }
}
```

ES will respond with the following to indicate success:

```
{
  "acknowledged": true
}
```

Thereafter you can confirm the mapping was created by doing a `GET` on "https://[fqdn index]/[current index name]/_mapping/resource" to view the whole mapping.

[Elastic documentation of put mapping](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-put-mapping.html)

 \* One case where *adding* a mapping may fail is if you've already written documents into the index containing the property that you want to add. Elastic may have made a guess about the mapping type, preventing you from overwriting it.

## Reindexing

To modify an index mapping fundamentally (e.g. to change the datatype of a field), you'll need to reindex. "Reindex" is kind of a misnomer because it's not possible to rebuild an index in situ; A reindex actually just copies data from one index to a new one. You must first create a destination index with your desired mapping and then trigger a reindex using one of the methods described below. Once complete, you'll have a new index with your old data mapped to the new mapping and can retire the original, source index. Naturally you'll have to ensure your ES instance has space enough to hold your data twice. You'll also have to take make sure that updates made to the source index are paused during the transfer - or replayed on the destination later. (Disabling IndexDocument trigger during the reindex is one method. Simply running IndexDocument from TRIM_HORIZON after reindex should also work provided the reindex completes within the 7 days of retention.)

We've used two methods for reindexing. One can use ES's native `_reindex` API if the source and destination exist on the same server. To reindex across domains, you may need to use logstash. (This may no longer be required with 5.1+?)

### Reindex api

Elastic offers a `_reindex` endpoint for moving data between indexes. In most cases you'll want to build a "pipeline" of "processors" to transform data.

#### 1. Build pipeline

1. First build the pipeline containing all fields to be `rename`d and all to be `remove`d (i.e. deprecated):
```
# PUT _ingest/pipeline/reindex-resources-2018-03-12-pipeline
{
  "description" : "Reindex resource mapping 2018-03-12",
  "processors" : [
    {
      "rename": {
        "field": "noteV3",
        "target_field": "note",
        "ignore_failure": true
      }
    },
    {
      "remove": {
        "field": "noteV2",
        "ignore_failure": true
      }
    },
    {
      "remove": {
        "field": "size",
        "ignore_failure": true
      }
    }
  ]
}
```

The above contrived example:
 * reindexes the contents of `noteV3` as `note`,
 * removes an old intermediary maping `noteV2`, and
 * removes an erroneous `size` mapping.

The `ignore_failure` entries ensure that an exception isn't thrown if the field isn't found in the source document (which will happen frequently for optional fields).

#### 2. Prepare destination index

The following will create an index called "resources-2018-03-12" in QA with the mappings currently defined in lib/index:

```
node jobs/index-admin prepare --index resources-2018-03-12 --profile nypl-sandbox --envfile config/qa.env
```

#### 3. Create a reindex task

```
# POST _reindex
{
  "source": {
    "index": "resources-2017-08-25"
  },
  "dest": {
    "index": "resources-2017-03-12",
    "pipeline": "reindex-resources-2018-03-12-pipeline"
  }
}
```

To view stats & progress:

```
node jobs/index-admin reindex-status --profile nypl-sandbox --envfile config/qa.env
```

The `reindex-status` call uses the `_tasks` api, which you can hit directly:

https://[fqdn]/_tasks?actions=*reindex&detailed=true

You'll see output like the following:
```
{
  "nodes": {
    "yzEvtFmfTUGgJWhUDqS46Q": {
      "name": "yzEvtFm",
      ...
      "tasks": {
          "yzEvtFmfTUGgJWhUDqS46Q:10076403": {
              "node": "yzEvtFmfTUGgJWhUDqS46Q",
              "id": 10076403,
              "type": "transport",
              "action": "indices:data/write/reindex",
              "status": {
                  "total": 14648476,
                  "updated": 0,
                  "created": 894000,
                  "deleted": 0,
                  "batches": 895,
                  "version_conflicts": 0,
                  ...
              },
              "description": "",
              "start_time_in_millis": 1520879406209,
              "running_time_in_nanos": 1102075559294,
              "cancellable": true
          }
      }
    }
  }
}
```

To cancel it for any reason, you can POST to https://[fqdn]/_tasks/[taskid]/_cancel (In above, taskid is "yzEvtFmfTUGgJWhUDqS46Q:10076403")

### Reindexing to a remote server using logstash

Logstash is another method useful when the data must move from one Elastic domain to another. Logstash can do a ton of things. A simple sample logstash document follows, showing how one can move data from one server to another (including property name changes, e.g. changing the name of property `subject` to `subjectLiteral`):

```
input {
  elasticsearch {
    hosts => ["https://[FQDN of source Elastic service]:443"]
    index => "resources-2017-05-19"
    docinfo => true
  }
}
filter {
  mutate {
    remove_field => [ "@version", "@timestamp" ]
    rename => { "subject" => "subjectLiteral" }
    rename => { "contributor" => "contributorLiteral" }
  }
  # add other transformations here
}
output {
  elasticsearch {
    hosts => ["https://[FQDN of destination Elastic service]"]
    manage_template => false
    index => "resources-2017-05-23"
    document_type => "%{[@metadata][_type]}"
    document_id => "%{[@metadata][_id]}"
  }
}
```

### Copying a index from Production to QA

A specific use of the above technique, which may arise regularly, is copying production data down to QA. This may be appropriate immediately following when the ILS team copies production Sierra to Sierra Test (after which, the data in the QA ES index will be out of sync with Sierra Test - although, confusingly, *in sync* with the Bib and Item services' data, which will continue to reflect the previous state of Sierra Test).

The following describes how to copy production down to QA using logstash with no downtime:

1. Ensure you have access to both domains by [adding your IP to the Access Policy for each](https://github.com/NYPL/aws/blob/master/common/elasticsearch.md#2-make-the-domain-public-restrict-by-ip). (You'll revert this later.)

2. Prepare the destination index (applies mapping, etc.):
```
node jobs/index-admin prepare --index resources-[YYYY-MM-DD] --profile nypl-digital-dev --envfile config/qa.env
```

3. Build an appropriate `logstash.conf`, such as:
```
input {
  elasticsearch {
    hosts => ["https://[fqdn of production domain]:443"]
    index => "resources-2018-09-07"
    docinfo => true
    query => '{ "sort": [ "uri" ] }'
  }
}
filter {
  mutate {
    remove_field => [ "@version", "@timestamp" ]
  }
}
output {
  elasticsearch {
    hosts => ["https://[fqdn of qa domain:443"]
    manage_template => false
    index => "resources-[YYYY-MM-DD]"
    document_type => "%{[@metadata][_type]}"
    document_id => "%{[@metadata][_id]}"
  }
}
```

4. Execute the logstash job:

Before starting the job, you may wish to disable the Kinesis trigger on the [`DiscoveryIndexPoster-qa`](https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions/DiscoveryIndexPoster-qa?tab=configuration) lambda to ensure no index updates occur during the copy. Doing this ensures that metadata updates picked up by the pollers during the copy will queue while you perform the copy; After the copy is complete, you can activate the new index and re-enable the trigger, allowing the IndexPoster to resume processing metadata updates from the queue.

Execute the job:

```
logstash -f logstash.conf
```

Logstash can be installed via `brew install logstash`. The [complete set of options to logstash are here](https://www.elastic.co/guide/en/logstash/current/running-logstash-command-line.html)

Follow progress by checking index doc count via `GET https://[fqdn of qa domain]]/_cat/indices?v`

5. When logstash indicates the job has completed, activate the new index:

Activate the new index for the index poster (to ensure metadata updates propagate to the new index):
 - In the AWS console, find the [`DiscoveryIndexPoster-qa](https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions/DiscoveryIndexPoster-qa?tab=configuration)
 - Update the `ELASTIC_RESOURCES_INDEX_NAME` environmental variable to the new index name
 - If you disabled the `DiscoveryIndexPoster-qa` Kinesis trigger in step 4, re-enable it now.

Activate the new index for the QA discovery-api (to ensure the discovery-api reads from the correct index)::
 - In the AWS console, find the [`discovery-api-qa` Elasticbeanstalk app](https://console.aws.amazon.com/elasticbeanstalk/home?region=us-east-1#/environment/dashboard?applicationName=discovery-api&environmentId=e-yhuttrxfem)
 - Update the `RESOURCES_INDEX` environmental variable to the name of the new index name
 - "Environment Actions" > "Restart app server(s)".

## Admin CLI

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

### Index Aliasing

**Note: although it is good practice to use timestamps (or version numbers) in our index names, it's no longer our practice to alias them through the "activate" subcommand. This section thus describes legacy functionality you probably don't need.**

As a convenience, a single "resources" alias points to the index that is "active". In the above, `resources-2017-01-09` is the active index. In practice, one should only "activate" an index after it has finished building and only after it has been tested to work with the presently deployed [discovery-api](https://github.com/nypl-discovery/discovery-api) Note that nothing presently relies on this alias; We've experimented with using index aliases to enable zero downtime index rebuilds, but have retired that practice because it's safer to point the discovery-api at the specific best index at any given time. (Relying on an index alias means apps using that alias may not be prepared for the new target schema.)

To **activate** an index:

`node jobs/index-admin activate --index [datestamped-index-name]`

So, for example, to create an alias called 'resources' pointing to index 'resources-2017-01-09', run:

`node jobs/index-admin activate --index resources-2017-01-09`

The code assumes from the timestamped index name that the desired alias is "resources" and will unassign the "resources" alias if it already exists.


