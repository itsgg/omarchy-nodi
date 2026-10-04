#!/bin/bash
# A script filter for the tests: notes whose name holds the query, a line of
# JSON each, then a line that is not JSON and one without a title.
q=${1:-}
[ "$NODI_QUERY" = "$q" ] || { echo '{"title": "NODI_QUERY differs"}'; exit 0; }
# Lowered first: "${q,,}" of an empty q inside a case pattern matches nothing.
lq=${q,,}
for n in "Meeting notes" "Weekly report" "Reading list"; do
  case "${n,,}" in *"$lq"*) printf '{"title": "%s", "subtitle": "a note", "id": "%s", "action": {"exec": ["notes-open", "%s"]}, "preview": "## %s\\n\\nfrom the notes"}\n' "$n" "$n" "$n" "$n" ;; esac
done
echo 'not json'
echo '{"subtitle": "no title"}'
