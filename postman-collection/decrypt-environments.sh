#!/bin/bash

for ENCRYPTED_PATH in ./.encrypted-environments/*
do
  DECRYPTED_PATH=$(echo "$ENCRYPTED_PATH" | sed "s/\/.encrypted-environments\//\/environments\//g")
  decrypted=$(AWS_DEFAULT_REGION=us-east-1 aws kms decrypt --profile nypl-digital-dev --query Plaintext --output text --ciphertext-blob fileb://<( cat $ENCRYPTED_PATH | base64 --decode) | base64 --decode)
  echo Decrypting $ENCRYPTED_PATH to $DECRYPTED_PATH
  echo $decrypted | json_pp > $DECRYPTED_PATH
done
