# Everything CI runs, in one command, before you push.
.PHONY: check test rank rank-update opens picks replay lint compile qstest shots textsize themes docs bench hygiene manifest validate install uninstall reload installed swap

PLUGIN_ID := io.github.itsgg.nodi
DEST := $(HOME)/.config/omarchy/plugins/$(PLUGIN_ID)

check: test rank lint compile qstest shots textsize hygiene manifest validate
	@echo "all checks passed"

test:
	@node --test "tests/js/*.test.mjs"

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

# The card drawn offscreen for each scene into shots/; a binding that fails
# when the card is created fails here.
shots:
	@tools/render.sh shots

# Every scene at Omarchy's largest text size (20, its Display panel's top)
# on this laptop's 1536x960: a card that would run off the screen fails
# (item 70).
textsize:
	@NODI_BASE_SIZE=20 NODI_SCREEN=1536x960 tools/render.sh shots/text-20

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
# reliable way to load a change.
reload: install
	@rm -rf "$(HOME)/.cache/quickshell/qmlcache"
	@omarchy restart shell || true

# Whether the installed copy is this tree and the running shell has loaded
# it; not in `check`, since installing is a step of its own.
installed:
	@tools/installed.sh "$(DEST)"

uninstall:
	@omarchy plugin disable $(PLUGIN_ID) 2>/dev/null || true
	@rm -rf "$(DEST)"
	@echo "removed; Nodi's cache stays in ~/.cache/nodi"
