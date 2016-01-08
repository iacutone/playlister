#!/bin/bash

echo "s3 script started"

user_id=$1
directory=$2
file=$3
# extention=$4
bucket='playlister-meteor'
date=$(date +"%a, %d %b %Y %T %z")
acl="x-amz-acl:public-read"
content_type="video/mp4"
string="PUT\n\n$content_type\n$date\n$acl\n/$bucket/$user_id/$file"
signature=$(echo -en "${string}" | openssl sha1 -hmac "${S3SECRET}" -binary | base64)
curl -X PUT -T "/$directory" \
  -H "Host: $bucket.s3.amazonaws.com" \
  -H "Date: $date" \
  -H "Content-Type: $content_type" \
  -H "$acl" \
  -H "Authorization: AWS ${S3KEY}:$signature" \
  "https://$bucket.s3.amazonaws.com/$user_id/$file"

echo "s3 upload complete"
echo $directory
rm -rf "/${directory:?}"
