# Everything CI runs, in one command, before you push.
.PHONY: check docs-check test rank rank-update opens picks replay lint compile qstest ui shots textsize a11y a11y-update ime themes docs bench hygiene manifest validate install uninstall reload installed swap

PLUGIN_ID := io.github.itsgg.nodi
DEST := $(HOME)/.config/omarchy/plugins/$(PLUGIN_ID)

check: test rank lint compile qstest ui shots textsize a11y ime hygiene manifest docs-check validate
	@echo "all checks passed"

test:
	@node --test "tests/js/*.test.mjs"

# The guide in docs/ held to the code (tools/docs.mjs): what is written
# from the code says what the code says, links reach what they name, and
# a setting named is one Nodi reads. `node tools/docs.mjs` writes it again.
docs-check:
	@node tools/docs.mjs --check

# How well the bar ranks, over a frozen corpus of what Omarchy ships: the
# rank of each query's meant row, letters typed until each app and each
# menu label is first, and a count of noise (tools/rank/rank.mjs). It fails on any difference
# from tools/rank/baseline.json, gains too, naming each; `make
# rank-update` accepts a change, and the baseline's diff goes in its
# commit. `node tools/rank/rank.mjs --live` reads this machine's lists.
rank:
	@node tools/rank/rank.mjs

rank-update:
	@node tools/rank/rank.mjs --update

# How long the bar's opens took on this machine, from the times Nodi keeps
# as it is used (lib/Opens.js): key to ranking, to the first frame, and to
# Hyprland's openlayer. `node tools/opens.mjs --since <time>` for a range.
opens:
	@node tools/opens.mjs

# How his picks went, from the log Nodi keeps (lib/PickLog.js): how many
# came first, the picked row's median place and the letters typed.
picks:
	@node tools/picks.mjs

# His picks replayed in order through today's ranking and learning, over
# this machine's lists, from no history (tools/rank/replay.mjs): each
# row's place now, and the letters to first before and after its pick.
# Not in `check`: the log is his.
replay:
	@node tools/rank/replay.mjs

# In `check` because a component the shell refuses to load passes every
# JavaScript test.
lint:
	@tools/qmllint.sh

# Quickshell compiles what qmllint passes and the shell would still refuse.
compile:
	@tools/compile-check.sh

# Components that need Quickshell's own types (a Reader is a Process), run
# inside it: tests/qml/*Test.qml.
qstest:
	@tools/qs-test.sh

# The real card under QtTest's mouse and keys, offscreen (tests/ui,
# ROADMAP 74): what a click does, which no scene can show.
ui:
	@NODI_UI=1 tools/render.sh shots/ui

# The card drawn offscreen for each scene into shots/; a binding that fails
# when the card is created fails here.
shots:
	@tools/render.sh shots

# Every scene at Omarchy's largest text size (20, its Display panel's top)
# on this laptop's 1536x960: a card that would run off the screen fails
# (item 70).
textsize:
	@NODI_BASE_SIZE=20 NODI_SCREEN=1536x960 tools/render.sh shots/text-20

# What a screen reader is told (item 71): the card on a private X server,
# D-Bus and accessibility bus, never the session's, walked with AT-SPI; the
# tree and the announcements of eight scenes against tests/a11y/expected.txt.
# `make a11y-update` accepts a change, its diff going in the commit.
A11Y_SCENES := 01-home,48-moved,13-nothing,49-fallback-moved,25-no-match,11-confirm,12-palette,50-palette-moved
a11y:
	@NODI_A11Y=$(A11Y_SCENES) tools/render.sh shots/a11y
	@diff -u tests/a11y/expected.txt shots/a11y/a11y.txt && echo "a11y: as expected"

# An input method composing into the card (ROADMAP 76): fcitx5 on a
# private X server and D-Bus; the query follows the composition, then
# what is committed (tests/ime/expected.txt).
ime:
	@NODI_IME=1 tools/render.sh shots/ime
	@diff -u tests/ime/expected.txt shots/ime/ime.txt && echo "ime: as expected"

a11y-update:
	@NODI_A11Y=$(A11Y_SCENES) tools/render.sh shots/a11y
	@mkdir -p tests/a11y && cp shots/a11y/a11y.txt tests/a11y/expected.txt && echo "a11y: tests/a11y/expected.txt updated"

# The shots again in other Omarchy themes, light ones and a rounded one
# among them, into shots/themes/: what a look change does beyond this one.
# A stock theme has only colors.toml (Omarchy writes its shell.toml when it
# is set), so these show the shell's defaults for the menu's alphas and
# border; the colours are the theme's. Any render failing fails the target.
THEMES := catppuccin-latte flexoki-light tokyo-night rose-pine
themes:
	@fail=0; \
	for t in $(THEMES); do \
	  NODI_THEME_DIR="/usr/share/omarchy/themes/$$t" tools/render.sh "shots/themes/$$t" > "shots/themes-$$t.log" 2>&1 || fail=1; \
	  sed "s/^/$$t: /" "shots/themes-$$t.log"; \
	done; \
	NODI_ROUNDING=10 NODI_THEME_DIR=/usr/share/omarchy/themes/tokyo-night tools/render.sh shots/themes/tokyo-night-rounded > shots/themes-rounded.log 2>&1 || fail=1; \
	sed "s/^/rounded: /" shots/themes-rounded.log; \
	exit $$fail

# The README's pictures, drawn offscreen in the live theme: the home view
# and four with the preview pane.
docs: shots
	@cp shots/docs-home.png docs/home.png
	@cp shots/27-themes.png docs/themes.png
	@cp shots/19-ask-answer.png docs/ask.png
	@cp shots/29-file-text.png docs/files.png
	@cp shots/26-clipboard.png docs/clipboard.png
	@echo "docs: five pictures in docs/"

# How long a keystroke takes, on node and in Qt's own engine, over a full
# machine's data; a measure to read, so not in `check`.
bench:
	@tools/bench.sh

hygiene:
	@node tools/hygiene.mjs

manifest:
	@node tools/check-manifest.mjs

# The shell's own loader checks, so a manifest the running Omarchy would
# reject cannot be committed.
validate:
	@omarchy plugin validate . && echo "omarchy validate: ok"

# A real directory, not a symlink: the shell's file watcher does not follow
# one, so a symlinked plugin never hot-reloads. By content (--checksum):
# rsync's size and mtime check skipped a file changed within the second an
# archive of the same tree was installed (2026-10-04, found by `installed`).
install:
	@mkdir -p "$(DEST)"
	@rsync -a --checksum --delete --exclude '.git' --exclude 'tests' --exclude '.github' --exclude 'shots' --exclude 'docs' ./ "$(DEST)/"
	@echo "installed; enable with: omarchy plugin enable $(PLUGIN_ID)"

# Quickshell caches compiled QML; clearing it and restarting the shell is the
# reliable way to load a change. The shell is stopped before the copy, and
# started once after: a running one reloads every plugin when a file of
# this one changes (Omarchy's shell, after 150 ms without a change), and an
# install of thirty files under load had it reload them again and again,
# 68 changes seen (2026-10-07; the restart after it crashed, cause unknown).
# Not while a locker holds the screen, as Omarchy's own restart refuses
# then (a session locked with no locker it restarts and locks again). The
# shell is down by the restart, so a failed one is tried once more and then
# fails the make, never passed over (Fable 2026-10-07).
reload:
	@if omarchy-hyprland-session-locked && [ "$$(OMARCHY_SHELL_IPC_TIMEOUT=0.5s omarchy-shell lock status 2>/dev/null | jq -r '.secure or .requested' 2>/dev/null)" = true ]; then \
	  echo "reload: the screen is locked; the shell is left running" >&2; exit 1; fi
	@while timeout 5 quickshell kill -p "$${OMARCHY_PATH:-/usr/share/omarchy}/shell" --any-display >/dev/null 2>&1; do :; done
	@$(MAKE) --no-print-directory install
	@rm -rf "$(HOME)/.cache/quickshell/qmlcache"
	@omarchy restart shell || omarchy restart shell

# Whether the installed copy is this tree and the running shell has loaded
# it; not in `check`, since installing is a step of its own.
installed:
	@tools/installed.sh "$(DEST)"

uninstall:
	@omarchy plugin disable $(PLUGIN_ID) 2>/dev/null || true
	@rm -rf "$(DEST)"
	@echo "removed; Nodi's cache stays in ~/.cache/nodi"
