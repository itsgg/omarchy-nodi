.pragma library

// JSONC: JSON with // and /* */ comments and trailing commas, which is what
// Omarchy's menu files and Nodi's own config are written in. Comments are
// only stripped outside strings, so a URL's "//" survives.

function strip(text) {
  // A leading byte-order mark, which some editors write, is not JSON.
  var src = String(text || "").replace(/^\uFEFF/, "")
  var out = ""
  var inString = false
  for (var i = 0; i < src.length; i++) {
    var c = src[i]
    if (inString) {
      out += c
      if (c === "\\") out += src[++i] || ""
      else if (c === "\"") inString = false
    } else if (c === "\"") {
      inString = true
      out += c
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++
      out += "\n"
    } else if (c === "/" && src[i + 1] === "*") {
      // Its newlines are kept, so a line number after it is the file's own,
      // and it stands as a space, so "1/* x */2" is not 12. One never
      // closed is an error: dropping the rest of the file would read as no
      // settings at all (codex 2026-10-04).
      i += 2
      out += " "
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++ }
      if (i >= src.length) throw new SyntaxError("a /* comment is never closed")
      i++
    } else {
      out += c
    }
  }
  return removeTrailingCommas(out)
}

// A comma followed only by whitespace and a closing bracket, outside strings.
function removeTrailingCommas(src) {
  var out = ""
  var inString = false
  for (var i = 0; i < src.length; i++) {
    var c = src[i]
    if (inString) {
      out += c
      if (c === "\\") out += src[++i] || ""
      else if (c === "\"") inString = false
      continue
    }
    if (c === "\"") { inString = true; out += c; continue }
    if (c === ",") {
      var j = i + 1
      while (j < src.length && /\s/.test(src[j])) j++
      if (src[j] === "}" || src[j] === "]") continue
    }
    out += c
  }
  return out
}

// Empty text is an empty object; anything else must parse, or this throws.
function parse(text) {
  var stripped = strip(text)
  if (!stripped.trim()) return {}
  return JSON.parse(stripped)
}

function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v) }

// Objects merge key by key; arrays and scalars from `over` replace `base`.
function merge(base, over) {
  if (!isObject(base) || !isObject(over)) return over === undefined ? base : over
  var out = {}
  var k
  for (k in base) out[k] = base[k]
  for (k in over) out[k] = merge(base[k], over[k])
  return out
}

// Where the text stops being JSONC, as "line 3: expected , or }", or "" when
// it parses. JSON.parse says where only in some engines (Qt's says "Parse
// error" and no more), so this walks the stripped text itself.
function locate(text) {
  var s = strip(text)
  var i = 0
  var fail = function(what) {
    var line = s.slice(0, i).split("\n").length
    throw { nodi: "line " + line + ": " + what }
  }
  // JSON's own whitespace; a no-break space is an error there, as here.
  var ws = function() { while (i < s.length && " \t\n\r".indexOf(s[i]) >= 0) i++ }
  var string = function() {
    i++
    while (i < s.length && s[i] !== "\"") {
      if (s[i] === "\n") fail("a string runs past the end of its line")
      if (s.charCodeAt(i) < 0x20) fail("a tab or control character in a string")
      if (s[i] === "\\") {
        var e = s[i + 1]
        if (e === "u" ? !/^[0-9a-fA-F]{4}$/.test(s.substr(i + 2, 4)) : "\"\\/bfnrt".indexOf(e) < 0 || e === undefined) fail("a bad escape in a string")
        i += e === "u" ? 6 : 2
      } else i++
    }
    if (i >= s.length) fail("a string is not closed")
    i++
  }
  var value = function() {
    ws()
    var c = s[i]
    if (c === "{") {
      i++; ws()
      if (s[i] === "}") { i++; return }
      for (;;) {
        ws()
        if (s[i] !== "\"") fail("expected a quoted name")
        string(); ws()
        if (s[i] !== ":") fail("expected : after a name")
        i++; value(); ws()
        if (s[i] === ",") { i++; continue }
        if (s[i] === "}") { i++; return }
        fail("expected , or }")
      }
    }
    if (c === "[") {
      i++; ws()
      if (s[i] === "]") { i++; return }
      for (;;) {
        value(); ws()
        if (s[i] === ",") { i++; continue }
        if (s[i] === "]") { i++; return }
        fail("expected , or ]")
      }
    }
    if (c === "\"") { string(); return }
    var m = /^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i))
    if (!m) fail(i >= s.length ? "the text ends early" : "expected a value")
    i += m[0].length
  }
  try {
    ws()
    if (i >= s.length) return ""
    value(); ws()
    if (i < s.length) fail("text after the end")
    return ""
  } catch (e) {
    if (e && e.nodi) return e.nodi
    throw e
  }
}
