.pragma library

// The result list's ListModel kept in step with the rows by each row's key,
// as PreviewPane keeps its blocks: a row still there keeps its delegate,
// moved if its place changed and told only if what it draws changed. Bound
// to the rows array itself, the ListView made every visible row again
// (tile, picture and all) at each keystroke, as each recompute hands a new
// array.

// A row's own id: its key, and its count among rows of the same key, so two
// rows with one key are two entries.
function uids(rows) {
  var seen = {}
  var out = []
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i] && rows[i].key !== undefined ? rows[i].key : "")
    var n = seen[key] || 0
    seen[key] = n + 1
    out.push(n === 0 ? key : key + "\u0001" + n)
  }
  return out
}

// What a row draws, as text to compare: everything but its preview, which
// the pane draws and which an answer remakes at every word. One that cannot
// be written out (a cycle) is new every time, so it is never left stale.
var unique = 0
function signature(row) {
  try {
    return JSON.stringify(row, function(k, v) { return k === "preview" ? undefined : v })
  } catch (e) {
    unique++
    return "\u0000" + unique
  }
}

// The steps that turn `current` (the model's entries, each { uid, sig })
// into the rows given, applied in order: remove { at, n }, insert { at,
// item }, move { from, to }, set { at, item }. `items` is what the model
// holds after them, each { uid, key, sig }.
function plan(current, rows) {
  var ids = uids(rows)
  var items = []
  var want = {}
  for (var i = 0; i < rows.length; i++) {
    items.push({ uid: ids[i], key: String(rows[i] && rows[i].key !== undefined ? rows[i].key : ""), sig: signature(rows[i]) })
    want[ids[i]] = true
  }
  var ops = []
  var have = []
  for (var c = 0; c < current.length; c++) have.push(current[c])
  // Gone first, from the end, runs of them as one step.
  for (var j = have.length - 1; j >= 0; j--) {
    if (want[have[j].uid]) continue
    var end = j
    while (j - 1 >= 0 && !want[have[j - 1].uid]) j--
    ops.push({ op: "remove", at: j, n: end - j + 1 })
    have.splice(j, end - j + 1)
  }
  for (var k = 0; k < items.length; k++) {
    var item = items[k]
    if (k < have.length && have[k].uid === item.uid) {
      if (have[k].sig !== item.sig) ops.push({ op: "set", at: k, item: item })
      have[k] = item
      continue
    }
    var from = -1
    for (var f = k + 1; f < have.length; f++) if (have[f].uid === item.uid) { from = f; break }
    if (from === -1) {
      ops.push({ op: "insert", at: k, item: item })
      have.splice(k, 0, item)
      continue
    }
    var old = have[from]
    ops.push({ op: "move", from: from, to: k })
    have.splice(from, 1)
    have.splice(k, 0, item)
    if (old.sig !== item.sig) ops.push({ op: "set", at: k, item: item })
  }
  return { ops: ops, items: items }
}

// The steps applied to a plain array, as Card applies them to its
// ListModel; for the tests.
function apply(list, ops) {
  var out = list.slice()
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i]
    if (o.op === "remove") out.splice(o.at, o.n)
    else if (o.op === "insert") out.splice(o.at, 0, o.item)
    else if (o.op === "move") { var it = out.splice(o.from, 1)[0]; out.splice(o.to, 0, it) }
    else if (o.op === "set") out[o.at] = o.item
  }
  return out
}
