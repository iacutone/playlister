#!/bin/bash

echo "Script started"

youtube-dl --default-search=ytsearch: \
           --restrict-filenames \
           --format=bestaudio \
           --audio-format=mp3 \
           --audio-quality=1 "$*" \
           --output="/Users/iacutone/code/fun/playlister/Downloads/audio/%(title)s.%(ext)s"

echo "Script finished"
