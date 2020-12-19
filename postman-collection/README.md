# Discovery API Postman Collection

This is a "collection" and set of "environment" files for [Postman](https://www.getpostman.com/), a useful utility for running raw HTTP queries. The collection contains a number of queries useful for debugging search queries, inspecting and updating mappings, running reindexes, etc.

## Requirements

For decrypting environment files (required to run most things in the collection), you'll need the [AWS CLI](https://aws.amazon.com/cli/) installed and have configured the `nypl-digital-dev` profile.

## Usage

To decrypt the environment files:

```
./decrypt-environments.sh
```

This will produce four decrypted environment files in `./environments`.

### Import Environments

*Note that if you already have the environments at the point of import, at writing Postman imports them as dupes; You may want to delete the existing environments first (because it will be unclear after import which are the newer versions).*

To import the environment files:

1. In Postman: File > Import > Import Folder and tap 'Choose Folders'
2. Select `./environments`

### Import Collection

*Note that if you already have the collection at the point of import, you will be given the option to import as a duplicate or wholely replace the existing collection; If you have local changes, you may want to stow them first (see Exporting & Contributing).*

To load the collection:

1. In Postman: File > Import > Import File and tap 'Chose Files'
2. Select `discovery.postman_collection.json`


## Exporting & Contributing

If you make changes to the collection or environments within Postman and would like to share them:

To export collection changes:

1. In Postman: Under 'Collections' > discovery, activate the "..." button and choose 'Export'
2. Export to `discovery.postman_collection.json`

To export environent changes:

1. In Postman: Activate the ⚙ icon ("Manage Enviroments") in the upper right of the window
2. Tap ⬇ icon ("Download Enviroment") next to each of the environments you wish to export
3. Save them into the `./environments/` directory

To encrypt the environments so that they can be securely shared:

```
./encrypt-environments.sh
```

This will encrypt each of the environment files in `./environments` and place them in `./.encrypted-environments`. Proceed by cutting a feature branch with the changes and creating a PR.

