#!/bin/bash
# @nodi.schemaVersion 1
# @nodi.title Say Hello
# @nodi.mode silent
# @nodi.packageName Examples
# @nodi.icon 👋
# @nodi.argument1 { "type": "text", "placeholder": "name" }
# @nodi.argument2 { "type": "dropdown", "placeholder": "tone", "optional": true, "data": [{ "title": "Loud", "value": "loud" }, { "title": "Soft", "value": "soft" }] }
echo "working"
echo "hello $NODI_ARGUMENT1${NODI_ARGUMENT2:+ ($NODI_ARGUMENT2)}"
