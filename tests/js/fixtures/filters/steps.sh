#!/bin/bash
# A filter in steps for the tests: folders first, then a folder's files,
# told what it was handed; a file picked prints nothing (done).
case "${NODI_STEP:-0}" in
  0) echo '{"data": "D"}'; echo '{"title": "Folder A", "action": {"next": "a"}, "info": "i-a"}' ;;
  1) printf '{"title": "File in %s [%s/%s/%s/%s]", "action": {"next": "file"}}\n' "$NODI_PICK" "$NODI_INFO" "$NODI_DATA" "$NODI_STEP" "$#" ;;
  *) ;;
esac
