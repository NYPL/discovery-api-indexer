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

[Elastic documentation of put mapping](https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-put-mapping.html)

 \* One case where *adding* a mapping may fail is if you've already written documents into the index containing the property that you want to add. Elastic may have made a guess about the mapping type, preventing you from overwriting it.

## Modifying an index mapping more fundamentally

If the modification changes the mapping type of one or more properties, you probably need to create a new index and bulk copy from the source. 

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


