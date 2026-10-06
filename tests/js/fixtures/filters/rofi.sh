#!/bin/bash
# A rofi script for the tests (rofi-script(5)): two entries first, then
# what a pick of Alpha gives, then nothing (done); what was typed comes
# back as ROFI_RETV=2.
case "${ROFI_RETV:-0}" in
  0) printf '\0message\x1fPick one\n\0data\x1fstart\nAlpha\0info\x1fa1\x1fmeta\x1ffirst letter\nBeta\0icon\x1fnetwork-wireless\n---\0nonselectable\x1ftrue\n' ;;
  1) if [ "$1" = Alpha ]; then printf 'info=%s data=%s\nAlpha one\nAlpha two\n' "$ROFI_INFO" "$ROFI_DATA"; fi ;;
  2) printf 'typed %s\n' "$1" ;;
esac
