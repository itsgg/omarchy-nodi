# Keys typed into an X window through XTest, for tests that run on a
# private Xvfb (tools/render.sh with NODI_IME, ROADMAP 76): libX11 and
# libXtst by ctypes, which Omarchy has (at-spi2-core needs libXtst), so no
# xdotool or python-xlib.
#
#   python3 -I tools/xkeys.py <display> <window title> <step>...
#
# A step is a key by its X name ("space", "Return"), modifiers joined by +
# ("ctrl+shift+u"), "text:<letters>" typed one at a time, or "sleep:<s>".
# Only letters, digits and keys by name: what the tests type.

import ctypes
import sys
import time
from ctypes import POINTER, byref, c_char_p, c_int, c_uint, c_ulong, c_void_p

X11 = ctypes.CDLL("libX11.so.6")
XTST = ctypes.CDLL("libXtst.so.6")
X11.XOpenDisplay.restype = c_void_p
X11.XOpenDisplay.argtypes = [c_char_p]
X11.XDefaultRootWindow.restype = c_ulong
X11.XDefaultRootWindow.argtypes = [c_void_p]
X11.XStringToKeysym.restype = c_ulong
X11.XStringToKeysym.argtypes = [c_char_p]
X11.XKeysymToKeycode.restype = ctypes.c_ubyte
X11.XKeysymToKeycode.argtypes = [c_void_p, c_ulong]
X11.XQueryTree.argtypes = [c_void_p, c_ulong, POINTER(c_ulong), POINTER(c_ulong), POINTER(POINTER(c_ulong)), POINTER(c_uint)]
X11.XFetchName.argtypes = [c_void_p, c_ulong, POINTER(c_char_p)]
X11.XSetInputFocus.argtypes = [c_void_p, c_ulong, c_int, c_ulong]
X11.XFlush.argtypes = [c_void_p]
X11.XSync.argtypes = [c_void_p, c_int]
X11.XFree.argtypes = [c_void_p]
XTST.XTestFakeKeyEvent.argtypes = [c_void_p, c_uint, c_int, c_ulong]
MODS = {"ctrl": "Control_L", "shift": "Shift_L", "alt": "Alt_L"}


def find(dpy, win, title):
    name = c_char_p()
    if X11.XFetchName(dpy, win, byref(name)) and name.value:
        found = name.value.decode("utf-8", "replace") == title
        X11.XFree(name)
        if found:
            return win
    root, parent, children, n = c_ulong(), c_ulong(), POINTER(c_ulong)(), c_uint()
    if not X11.XQueryTree(dpy, win, byref(root), byref(parent), byref(children), byref(n)):
        return 0
    try:
        for i in range(n.value):
            w = find(dpy, children[i], title)
            if w:
                return w
    finally:
        if children:
            X11.XFree(children)
    return 0


def press(dpy, names):
    codes = [X11.XKeysymToKeycode(dpy, X11.XStringToKeysym(n.encode())) for n in names]
    if not all(codes):
        sys.exit("xkeys: no key named " + " ".join(names))
    for c in codes:
        XTST.XTestFakeKeyEvent(dpy, c, 1, 0)
    for c in reversed(codes):
        XTST.XTestFakeKeyEvent(dpy, c, 0, 0)
    X11.XSync(dpy, 0)
    time.sleep(0.05)


def main():
    dpy = X11.XOpenDisplay(sys.argv[1].encode())
    if not dpy:
        sys.exit("xkeys: no display " + sys.argv[1])
    win = 0
    for _ in range(50):
        win = find(dpy, X11.XDefaultRootWindow(dpy), sys.argv[2])
        if win:
            break
        time.sleep(0.1)
    if not win:
        sys.exit("xkeys: no window titled " + sys.argv[2])
    X11.XSetInputFocus(dpy, win, 1, 0)
    X11.XSync(dpy, 0)
    time.sleep(0.3)
    for step in sys.argv[3:]:
        if step.startswith("sleep:"):
            time.sleep(float(step[6:]))
        elif step.startswith("text:"):
            for ch in step[5:]:
                press(dpy, [ch])
        else:
            parts = step.split("+")
            press(dpy, [MODS.get(p, p) for p in parts])
    time.sleep(0.3)


main()
