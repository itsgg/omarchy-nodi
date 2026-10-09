.pragma library
.import "../lib/Undo.js" as Undo

// The undo an undoable action left (lib/Undo.js), found by its title or by
// "undo"; the empty bar lists every one (lib/Engine.js home).
var provider = {
  id: "undo",
  name: "Undo",
  icon: Undo.ICON,
  help: [
    { id: "undo", title: "Undo", icon: Undo.ICON, about: "What an action of yours said would take it back, for ten minutes after it ran",
      examples: [{ q: "undo", note: "Every undo still on offer" }] }
  ],
  match: function(query, ctx) {
    var rows = Undo.raw(ctx.undo || [], query, (ctx.now ? ctx.now() : new Date()).getTime())
    // `undo` with none on offer says so: files named undo stood in its place
    // (2026-10-10, driven live).
    if (!rows.length && /^\s*undo\s*$/i.test(String(query || ""))) return [{ key: "undo:none", title: "Nothing to undo", subtitle: "An action that can be taken back offers it here for ten minutes", icon: Undo.ICON, score: 40, copy: "", remember: false }]
    return rows
  }
}
