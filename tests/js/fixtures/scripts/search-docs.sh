#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Search Docs
# @raycast.mode silent
# @raycast.argument1 { "type": "text", "placeholder": "query", "percentEncoded": true }
xdg-open "https://docs.example.com/?q=$1"
