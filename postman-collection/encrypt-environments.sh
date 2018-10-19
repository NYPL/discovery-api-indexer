#!/bin/bash

for DECRYPTED_PATH in ./environments/*.json
do
  ENCRYPTED_PATH=$(echo "$DECRYPTED_PATH" | sed "s/\/environments\//\/.encrypted-environments\//g")
  encrypted=$(AWS_DEFAULT_REGION=us-east-1 aws kms encrypt --key-id alias/lambda-default --profile nypl-digital-dev --query CiphertextBlob --output text --plaintext fileb://$DECRYPTED_PATH);
  echo Encrypting $DECRYPTED_PATH to $ENCRYPTED_PATH
  echo $encrypted > $ENCRYPTED_PATH
done
