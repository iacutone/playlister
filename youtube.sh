#!/bin/bash

echo "Script started"

user_id=$1
shift

youtube-dl --default-search=ytsearch: \
           --restrict-filenames \
           --format=bestaudio \
           --audio-format=mp3 \
           --audio-quality=1 "$*" \
           --output="/Users/iacutone/code/fun/playlister/tmp/$user_id/%(title)s.%(ext)s"

echo "youtube-dl finished"
