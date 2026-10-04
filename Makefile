# Everything CI runs, in one command, before you push.
.PHONY: check test lint compile qstest shots themes bench hygiene manifest validate install uninstall reload installed swap

PLUGIN_ID := io.github.itsgg.nodi
DEST := $(HOME)/.config/omarchy/plugins/$(PLUGIN_ID)

check: test lint compile qstest shots hygiene manifest validate
	@echo "all checks passed"

test:
	@node --test "tests/js/*.test.mjs"

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
