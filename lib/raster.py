#!/usr/bin/python3
"""Decode a local image outside the shell, emitting only a new bounded PNG.

The path arrives in NODI_IMAGE, never argv. Python, GObject and GdkPixbuf
ship with Omarchy. No source bytes or metadata are passed to Qt.
"""

import base64
import configparser
import hashlib
import os
import re
import resource
import signal
import stat
import struct
import sys
import time
import zlib
from urllib.parse import unquote, urlsplit

INPUT_MAX = 16 * 1024 * 1024
MEMORY_MAX = 2048 * 1024 * 1024
ICON_MEMORY_MAX = 512 * 1024 * 1024
PIXELS_MAX = 16 * 1024 * 1024
EDGE_MAX = 1000
# The icon cache keeps what was used in the last 30 days, at most 3000
# files (about 20 KB each), looked over at most once a day, after a decode
# wrote a new one: the cheap moment, as a decode already costs far more.
CACHE_MAX_AGE = 30 * 24 * 60 * 60
CACHE_MAX_FILES = 3000
PRUNE_EVERY = 24 * 60 * 60


def limits(edge=EDGE_MAX):
    # Before opening the file or importing any decoder. These include native
    # allocations and compressed metadata, unlike a pixel allocation limit.
    memory_max = ICON_MEMORY_MAX if edge == 128 else MEMORY_MAX
    for kind, value in ((resource.RLIMIT_AS, memory_max),
                        (resource.RLIMIT_CPU, 3), (resource.RLIMIT_CORE, 0),
                        (resource.RLIMIT_FSIZE, 64 * 1024 * 1024)):
        # A lower hard limit already set is kept: raising one is refused.
        hard = resource.getrlimit(kind)[1]
        if hard != resource.RLIM_INFINITY:
            value = min(value, hard)
        resource.setrlimit(kind, (value, value))
    # Out of memory, the kernel ends this worker before the shell.
    with open("/proc/self/oom_score_adj", "w", encoding="ascii") as stream:
        stream.write("1000")
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


def cache_entry(data, edge):
    cache_base = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    key = hashlib.sha256(struct.pack(">I", edge) + data).hexdigest()[:32]
    return os.path.join(cache_base, "nodi", "icons", key + ".png")


def get_cached(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
        with os.fdopen(fd, "rb") as stream:
            cached = stream.read()
            if (len(cached) >= 12 and
                    cached.startswith(b"\x89PNG\r\n\x1a\n") and
                    cached.endswith(b"IEND\xaeB`\x82")):
                # Its time is when it was last used, which pruning reads.
                try:
                    os.utime(stream.fileno())
                except OSError:
                    pass
                return cached
    except (OSError, ValueError):
        pass
    return None


def prune(directory, now, max_age=CACHE_MAX_AGE, max_files=CACHE_MAX_FILES):
    """Drop icons unused for max_age, then the least recently used past
    max_files, and temporary files a killed worker left. Returns how many
    remain."""
    kept = []
    try:
        entries = list(os.scandir(directory))
    except OSError:
        return 0
    for entry in entries:
        try:
            if not entry.is_file(follow_symlinks=False):
                continue
            used = entry.stat(follow_symlinks=False).st_mtime
            name = entry.name
            if ".tmp." in name:
                if now - used > 3600:
                    os.unlink(entry.path)
                continue
            if not name.endswith(".png"):
                continue
            if now - used > max_age:
                os.unlink(entry.path)
                continue
            kept.append((used, entry.path))
        except OSError:
            continue
    kept.sort()
    while len(kept) > max_files:
        try:
            os.unlink(kept.pop(0)[1])
        except OSError:
            pass
    return len(kept)


def prune_due(directory, now):
    """Whether a day has passed since the cache was last looked over; marks
    it looked over now if so."""
    marker = os.path.join(directory, ".pruned")
    try:
        if now - os.stat(marker).st_mtime < PRUNE_EVERY:
            return False
    except OSError:
        pass
    try:
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_CLOEXEC, 0o600)
        os.close(fd)
        os.utime(marker, (now, now))
    except OSError:
        return False
    return True


def put_cached(path, png_bytes):
    try:
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        tmp = f"{path}.tmp.{os.getpid()}"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(png_bytes)
        os.replace(tmp, path)
        directory = os.path.dirname(path)
        now = time.time()
        if prune_due(directory, now):
            prune(directory, now)
    except (OSError, ValueError):
        pass


def main():
    edge = int(sys.argv[1]) if len(sys.argv) == 2 else 128
    if edge not in (128, EDGE_MAX):
        raise ValueError("invalid size")
    limits(edge)
    os.umask(0o077)
    path = icon_path(os.environ.pop("NODI_IMAGE", ""))
    data = read_image(path)
    cpath = cache_entry(data, edge) if edge == 128 else None
    if cpath:
        cached = get_cached(cpath)
        if cached:
            print("data:image/png;base64," + base64.b64encode(cached).decode("ascii"))
            return
    out = raster(data, edge)
    if cpath:
        put_cached(cpath, out)
    encoded = base64.b64encode(out).decode("ascii")
    print("data:image/png;base64," + encoded)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never echo private paths or decoder diagnostics into the shell.
        sys.exit(1)
