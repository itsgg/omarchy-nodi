#!/bin/bash
# A script filter for the tests: notes whose name holds the query, a line of
# JSON each, then a line that is not JSON and one without a title.
# The query is NODI_QUERY, never an argument (the marketplace's review,
# 2026-10-10): one given is said.
q=${NODI_QUERY-}
[ $# -eq 0 ] || { echo '{"title": "an argument was given"}'; exit 0; }
# "window" answers with the window it was told of, a field a line.
if [ "$q" = window ]; then
  for v in "$NODI_WINDOW_ADDRESS" "$NODI_WINDOW_CLASS" "$NODI_WINDOW_TITLE" "$NODI_WINDOW_PID" "$NODI_WINDOW_WORKSPACE"; do
    printf '{"title": "[%s]"}\n' "$v"
  done
  exit 0
fi
# Lowered first: "${q,,}" of an empty q inside a case pattern matches nothing.
lq=${q,,}
for n in "Meeting notes" "Weekly report" "Reading list"; do
  case "${n,,}" in *"$lq"*) printf '{"title": "%s", "subtitle": "a note", "id": "%s", "action": {"exec": ["notes-open", "%s"]}, "preview": "## %s\\n\\nfrom the notes"}\n' "$n" "$n" "$n" "$n" ;; esac
done
echo 'not json'
echo '{"subtitle": "no title"}'
