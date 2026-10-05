.pragma library

// How long each open takes (ROADMAP 30), from what Nodi.qml stamps: the
// open's start (the shortcut's press or the call), the first ranking done,
// the first frame the window swaps, and Hyprland's openlayer for the bar's
// layer, each in ms after the start (-1: not seen). The last MAX opens are
// kept in ~/.cache/nodi/opens.json, and `make opens` reads them. Nothing
// of what was typed is kept: only whether the field held text.

var MAX = 300
var PHASES = ["ranked", "frame", "layer"]

function start(at, how, held) {
  return { at: at, how: how, held: !!held, ranked: -1, frame: -1, layer: -1 }
}

// The first time a phase is seen, after the start; later ones are not the open's.
function stamp(rec, phase, at) {
  if (rec && rec[phase] === -1 && at >= rec.at) rec[phase] = at - rec.at
  return rec
}

function add(list, rec) {
  var out = (list || []).concat([rec])
  return out.length > MAX ? out.slice(out.length - MAX) : out
}

function parse(text) {
  try {
    var v = JSON.parse(text)
    return Array.isArray(v) ? v.filter(function(r) { return r && typeof r.at === "number" }).slice(-MAX) : []
  } catch (e) { return [] }
}

function serialize(list) { return JSON.stringify(list || []) }

function percentile(sorted, p) {
  if (!sorted.length) return -1
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

// Median and 90th percentile of each phase over the opens that saw it.
function summary(list) {
  var out = { opens: (list || []).length }
  PHASES.forEach(function(phase) {
    var v = (list || []).map(function(r) { return r[phase] }).filter(function(x) { return typeof x === "number" && x >= 0 })
    v.sort(function(a, b) { return a - b })
    out[phase] = { seen: v.length, p50: percentile(v, 0.5), p90: percentile(v, 0.9) }
  })
  return out
}
