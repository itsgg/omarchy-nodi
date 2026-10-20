#!/usr/bin/python3
"""Decode a local image outside the shell, emitting only a new bounded PNG.

The path arrives in NODI_IMAGE, never argv. Python, GObject and GdkPixbuf
ship with Omarchy. No source bytes or metadata are passed to Qt.
"""

import base64
import configparser
import os
import re
import resource
import signal
import stat
import struct
import sys
import zlib
from urllib.parse import unquote, urlsplit

INPUT_MAX = 16 * 1024 * 1024
MEMORY_MAX = 2048 * 1024 * 1024
PIXELS_MAX = 16 * 1024 * 1024
EDGE_MAX = 1000


def limits():
    # Before opening the file or importing any decoder. These include native
    # allocations and compressed metadata, unlike a pixel allocation limit.
    for kind, value in ((resource.RLIMIT_AS, MEMORY_MAX),
                        (resource.RLIMIT_CPU, 3), (resource.RLIMIT_CORE, 0),
                        (resource.RLIMIT_FSIZE, 64 * 1024 * 1024)):
        resource.setrlimit(kind, (value, value))
    signal.signal(signal.SIGALRM, lambda *_: os._exit(124))
    signal.alarm(4)
    os.environ["RAYON_NUM_THREADS"] = "1"
    os.environ["OMP_NUM_THREADS"] = "1"


def local_path(value):
    if value.startswith("file:"):
        url = urlsplit(value)
        if url.netloc or url.query or url.fragment:
            raise ValueError("not a local file")
        value = unquote(url.path, errors="strict")
    if not value.startswith("/") or "\0" in value or len(value) > 8192:
        raise ValueError("not an absolute path")
    return value


def icon_path(value):
    # Theme lookup also stays outside Qt. Gtk resolves names to filenames;
    # only read_image() opens the chosen file and the loader gets bytes.
    if value.startswith("image://icon/"):
        value = value[len("image://icon/"):].split("?", 1)[0]
    if value.startswith(("/", "file:")):
        return local_path(value)
    if not re.fullmatch(r"[A-Za-z0-9_.+-]{1,256}", value):
        raise ValueError("invalid icon name")
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import Gtk
    theme = Gtk.IconTheme.new()
    name = "Adwaita"
    settings = os.path.expanduser("~/.config/gtk-3.0/settings.ini")
    try:
        config = configparser.ConfigParser(interpolation=None)
        with open(settings, encoding="utf-8") as stream:
            config.read_string(stream.read(16384))
        name = config.get("Settings", "gtk-icon-theme-name", fallback=name)
    except (OSError, ValueError, configparser.Error):
        pass
    theme.set_custom_theme(name)
    info = theme.lookup_icon(value, 128, 0) or theme.lookup_icon("application-x-executable", 128, 0)
    if not info or not info.get_filename():
        raise ValueError("no icon")
    return local_path(info.get_filename())


def read_image(path):
    # NONBLOCK makes a FIFO substituted for the file fail rather than wait.
    # Follow ordinary symlinks, but validate and read the same descriptor.
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= INPUT_MAX:
            raise ValueError("not a bounded regular file")
        data = stream.read(INPUT_MAX + 1)
        after = os.fstat(stream.fileno())
        if (len(data) != before.st_size or
                (before.st_size, before.st_mtime_ns, before.st_ctime_ns) !=
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns)):
            raise ValueError("file changed while reading")
        return data


def png(width, height, channels, stride, pixels):
    if (not 0 < width <= EDGE_MAX or not 0 < height <= EDGE_MAX or
            channels not in (3, 4) or stride < width * channels or
            len(pixels) < (height - 1) * stride + width * channels):
        raise ValueError("invalid raster")
    rows = b"".join(b"\0" + pixels[y * stride:y * stride + width * channels]
                    for y in range(height))

    def chunk(kind, body):
        return (struct.pack(">I", len(body)) + kind + body +
                struct.pack(">I", zlib.crc32(kind + body)))

    # Write these three chunks ourselves. In particular, never ask the
    # decoder to save the image with its original options or profiles.
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8,
                                      6 if channels == 4 else 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(rows, 1)) + chunk(b"IEND", b""))


def raster(data, edge):
    # Glycin's Rust loaders otherwise reserve one thread stack per CPU,
    # exhausting the address-space ceiling even for a small valid icon.
    os.environ["RAYON_NUM_THREADS"] = "1"
    import gi
    gi.require_version("GdkPixbuf", "2.0")
    from gi.repository import GdkPixbuf

    loader = GdkPixbuf.PixbufLoader.new()

    def sized(obj, width, height):
        # Exceptions in a GObject callback are swallowed; exit the worker.
        if width <= 0 or height <= 0 or width * height > PIXELS_MAX:
            os._exit(1)
        scale = min(1.0, edge / max(width, height))
        obj.set_size(max(1, int(width * scale)), max(1, int(height * scale)))

    loader.connect("size-prepared", sized)
    # Memory input gives SVGs no base URI: librsvg permits embedded data,
    # but cannot fetch a neighbouring file or a network resource.
    loader.write(data)
    loader.close()
    pixbuf = loader.get_pixbuf()
    if pixbuf is None or pixbuf.get_bits_per_sample() != 8:
        raise ValueError("no raster")
    width, height = pixbuf.get_width(), pixbuf.get_height()
    if width > edge or height > edge:
        scale = edge / max(width, height)
        pixbuf = pixbuf.scale_simple(max(1, int(width * scale)),
                                    max(1, int(height * scale)), GdkPixbuf.InterpType.BILINEAR)
    return png(pixbuf.get_width(), pixbuf.get_height(), pixbuf.get_n_channels(),
               pixbuf.get_rowstride(), pixbuf.get_pixels())


def main():
    limits()
    os.umask(0o077)
    path = icon_path(os.environ.pop("NODI_IMAGE", ""))
    edge = int(sys.argv[1]) if len(sys.argv) == 2 else 128
    if edge not in (128, EDGE_MAX):
        raise ValueError("invalid size")
    encoded = base64.b64encode(raster(read_image(path), edge)).decode("ascii")
    print("data:image/png;base64," + encoded)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never echo private paths or decoder diagnostics into the shell.
        sys.exit(1)
