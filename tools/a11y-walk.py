# What a screen reader gets from Nodi's card (item 71), for tools/render.sh
# with NODI_A11Y: run inside its private D-Bus session, beside the render
# harness, whose log says each scene as it is held ("SCENE <name>"). For
# each scene it writes what was announced since the last one and the tree
# under the harness's window, then ends with the harness.
#
#   python3 -I tools/a11y-walk.py <harness log> <harness pid>
#
# Only the harness's own application is walked, on a bus that holds
# nothing else.

import os
import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi, GLib  # noqa: E402

log_path, pid = sys.argv[1], int(sys.argv[2])
STATES = [("selected", Atspi.StateType.SELECTED), ("focused", Atspi.StateType.FOCUSED)]
heard = []
seen = 0


def said(ev):
    text = ev.any_data if isinstance(ev.any_data, str) else ""
    heard.append(text)


def app():
    desktop = Atspi.get_desktop(0)
    for i in range(desktop.get_child_count()):
        a = desktop.get_child_at_index(i)
        if a is not None and a.get_name() == "Qml Runtime":
            return a
    return None


def tree(acc, depth, out):
    try:
        role, name, desc = acc.get_role_name(), acc.get_name() or "", acc.get_description() or ""
        states = acc.get_state_set()
    except Exception:
        return
    # The runtime's own path says nothing of Nodi.
    if role == "application":
        desc = ""
    flags = [n for (n, s) in STATES if states.contains(s)]
    # What is not on screen, which a screen reader passes over.
    if not states.contains(Atspi.StateType.SHOWING):
        flags.append("hidden")
    # The window's own layers say nothing; what is in them does.
    if role not in ("application", "frame", "filler") or name:
        out.append("  " * depth + "[%s] %r" % (role, name) + (" desc=%r" % desc if desc else "") + (" " + ",".join(flags) if flags else ""))
        depth += 1
    for i in range(acc.get_child_count()):
        child = acc.get_child_at_index(i)
        if child is not None:
            tree(child, depth, out)


def alive():
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def tick(loop):
    global seen
    try:
        with open(log_path) as f:
            # Whole lines only: the last may still be being written.
            lines = f.read().split("\n")[:-1]
    except OSError:
        lines = []
    for line in lines[seen:]:
        # "qml: SCENE <name>", as qml6 logs it.
        at = line.find("SCENE ")
        if at != -1:
            print("SCENE " + line[at + 6:].strip())
            for h in heard:
                print("  said %r" % h)
            del heard[:]
            a = app()
            out = []
            if a is not None:
                tree(a, 1, out)
            print("\n".join(out) if out else "  (no tree)")
            sys.stdout.flush()
    seen = max(seen, len(lines))
    if not alive():
        loop.quit()
        return False
    return True


def main():
    Atspi.init()
    listener = Atspi.EventListener.new(said)
    listener.register("object:announcement")
    loop = GLib.MainLoop()
    GLib.timeout_add(100, tick, loop)
    GLib.timeout_add_seconds(65, loop.quit)
    loop.run()


main()
