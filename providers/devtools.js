.pragma library
.import "../lib/Score.js" as Score

// Small things a developer reaches for:
//   uuid                  a random UUID v4
//   b64 text              Base64 of the text's UTF-8 bytes, and the decoding
//                         when the text is Base64 of valid UTF-8
//   epoch, epoch 1790000000   the current Unix time, or a time read from one
//   #ff5722, rgb(1,2,3)   a colour as hex, rgb and hsl, with a swatch

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

// UTF-8 bytes of a string, through encodeURIComponent so every code point,
// Tamil and emoji included, is encoded the way the standard says.
function utf8Bytes(text) {
  var enc = encodeURIComponent(String(text))
  var bytes = []
  for (var i = 0; i < enc.length; i++) {
    if (enc[i] === "%") { bytes.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2 }
    else bytes.push(enc.charCodeAt(i))
  }
  return bytes
}

// The string those bytes spell, or null when they are not valid UTF-8.
function utf8Text(bytes) {
  var hex = ""
  for (var i = 0; i < bytes.length; i++) hex += "%" + (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16)
  try { return decodeURIComponent(hex) } catch (e) { return null }
}

function b64Encode(text) {
  var b = utf8Bytes(text)
  var out = ""
  for (var i = 0; i < b.length; i += 3) {
    var n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    out += i + 1 < b.length ? B64[(n >> 6) & 63] : "="
    out += i + 2 < b.length ? B64[n & 63] : "="
  }
  return out
}

// null unless the text is well-formed Base64 (standard or URL-safe alphabet,
// padding optional) of valid UTF-8 without control characters.
function b64Decode(text) {
  var s = String(text || "").trim().replace(/-/g, "+").replace(/_/g, "/")
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null
  s = s.replace(/=+$/, "")
  if (s.length % 4 === 1) return null
  var bytes = []
  var bits = 0
  var value = 0
  for (var i = 0; i < s.length; i++) {
    value = (value << 6) | B64.indexOf(s[i])
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >> bits) & 255)
    }
  }
  var out = utf8Text(bytes)
  if (out === null || out === "" || /[\u0000-\u0008\u000e-\u001f\u007f]/.test(out)) return null
  return out
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

function hex2(n) { return (n < 16 ? "0" : "") + n.toString(16).toUpperCase() }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  var max = Math.max(r, g, b), min = Math.min(r, g, b)
  var h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    var d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function parseColor(text) {
  var s = String(text || "").trim().toLowerCase()
  var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  if (m) {
    var h = m[1]
    if (h.length <= 4) h = h.split("").map(function(c) { return c + c }).join("")
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  m = s.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+))?\s*\)$/)
  if (m) {
    var c = [m[1], m[2], m[3]].map(function(v) { return Math.min(255, parseInt(v, 10)) })
    return { r: c[0], g: c[1], b: c[2], a: m[4] !== undefined ? Math.min(1, parseFloat(m[4])) : 1 }
  }
  return null
}

function pad(n) { return (n < 10 ? "0" : "") + n }

function localStamp(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
}

var provider = {
  id: "devtools",
  name: "Developer",
  icon: "󰅩",
  commands: [
    { title: "Generate a UUID", keywords: "uuid guid random id", text: "A random UUID v4", complete: "uuid" },
    { title: "Base64 encode or decode", keywords: "base64 b64 encode decode", text: "b64 hello", complete: "b64 " },
    { title: "Unix time", keywords: "epoch unix timestamp time", text: "Now, or a timestamp read", complete: "epoch" }
  ],
  help: [
    { id: "devtools", title: "Developer", about: "UUIDs, Base64, Unix time and colours",
      examples: [{ q: "uuid", note: "A new UUID v4 each time" }, "b64 hello", "b64 aGVsbG8=", { q: "epoch", note: "Now, in seconds and milliseconds" }, "#ff5722"] }
  ],
  match: function(query, ctx) {
    return Score.answers(answer(query, ctx))
  }
}

function answer(query, ctx) {
  {
    var raw = String(query || "").trim()
    if (!raw) return []

    if (/^(uuid|uuidv4|guid)$/i.test(raw)) {
      var id = uuid()
      return [{ key: "uuid", title: id, subtitle: "UUID v4", icon: "󰡷", score: 95, copy: id }]
    }

    // Matched before the trim: what follows the word is the payload as
    // typed, its trailing spaces and newlines included (codex 2026-10-05).
    var b = String(query || "").replace(/^\s+/, "").match(/^(?:b64|base64)(?:\s+(?:(encode|decode)\s+)?([\s\S]*))?$/i)
    if (b) {
      var how = (b[1] || "").toLowerCase()
      var text = b[2] === undefined ? "" : b[2]
      // Typed alone, it takes text selected just before, else the
      // clipboard's, which the rows show.
      var sel = ctx.selection || {}
      if (!text && sel.fresh && sel.text) text = String(sel.text)
      if (!text && sel.clipboard) text = String(sel.clipboard)
      if (!text) return [{ title: "Base64", subtitle: "Encode or decode", icon: "󰅩", score: 85, copy: "", hint: "b64 <text>" }]
      var rows = []
      if (how !== "encode") {
        var decoded = b64Decode(text)
        if (decoded !== null) rows.push({ key: "b64:decode", title: decoded, subtitle: "Decoded from Base64", icon: "󰅩", score: 96, copy: decoded })
        else if (how === "decode") rows.push({ title: "Not Base64 of UTF-8 text", subtitle: "Base64", icon: "󰅩", score: 60, copy: "" })
      }
      if (how !== "decode") {
        var encoded = b64Encode(text)
        rows.push({ key: "b64:encode", title: encoded, subtitle: "Encoded to Base64", icon: "󰅩", score: 95, copy: encoded })
      }
      return rows
    }

    var e = raw.match(/^(?:epoch|unix|timestamp)(?:\s+(-?\d{1,16}))?$/i)
    if (e) {
      if (!e[1]) {
        var now = ctx.now()
        var ms = now.getTime()
        return [
          { key: "epoch:s", title: String(Math.floor(ms / 1000)), subtitle: "Unix time in seconds, " + localStamp(now), icon: "󱑂", score: 96, copy: String(Math.floor(ms / 1000)) },
          { key: "epoch:ms", title: String(ms), subtitle: "Unix time in milliseconds", icon: "󱑂", score: 95, copy: String(ms) }
        ]
      }
      // Up to 11 digits read as seconds (until the year 5138), more as milliseconds.
      var digits = e[1].replace(/^-/, "")
      var when = new Date(digits.length <= 11 ? parseInt(e[1], 10) * 1000 : parseInt(e[1], 10))
      if (isNaN(when.getTime())) return []
      return [
        { key: "epoch:local", title: localStamp(when), subtitle: "Local time, from " + (digits.length <= 11 ? "seconds" : "milliseconds"), icon: "󱑂", score: 96, copy: localStamp(when) },
        { key: "epoch:iso", title: when.toISOString(), subtitle: "UTC, ISO 8601", icon: "󱑂", score: 95, copy: when.toISOString() }
      ]
    }

    var c = parseColor(raw)
    if (c) {
      // A colour that is see-through stays so in every form: #RRGGBBAA, and
      // its alpha in rgb() and hsl() (codex 2026-10-05: #ff000000 copied as
      // opaque red). The swatch is Qt's colour, alpha first.
      var alpha = c.a < 1 ? hex2(Math.round(c.a * 255)) : ""
      var hex = "#" + hex2(c.r) + hex2(c.g) + hex2(c.b) + alpha
      var swatch = "#" + alpha + hex2(c.r) + hex2(c.g) + hex2(c.b)
      var hsl = rgbToHsl(c.r, c.g, c.b)
      var a = c.a < 1 ? ", " + Number(c.a.toFixed(2)) : ""
      var rgb = "rgb(" + c.r + ", " + c.g + ", " + c.b + a + ")"
      var hslText = "hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%" + a + ")"
      return [
        { key: "color:hex", title: hex, subtitle: "Hex", swatch: swatch, score: 96, copy: hex },
        { key: "color:rgb", title: rgb, subtitle: "RGB", swatch: swatch, score: 95, copy: rgb },
        { key: "color:hsl", title: hslText, subtitle: "HSL", swatch: swatch, score: 94, copy: hslText }
      ]
    }
    return []
  }
}
