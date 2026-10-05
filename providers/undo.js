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
    return Undo.raw(ctx.undo || [], query, (ctx.now ? ctx.now() : new Date()).getTime())
  }
}
