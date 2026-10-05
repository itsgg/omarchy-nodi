.pragma library

// The row at `index` of a ListView in view, with `reach` of the next row
// still showing below it while rows remain, and of the one before above
// it: as Omarchy's menu scrolls (Menu.qml), so the row about to run is never
// the one under a fade (Fable 2026-10-05). The list and Ctrl+K's actions
// both scroll by it. `contain` is ListView.Contain, which a library cannot
// name.
function keep(view, index, reach, contain) {
  if (!view || index < 0) return
  view.positionViewAtIndex(index, contain)
  var item = view.itemAtIndex(index)
  if (!item) return
  var top = view.originY
  var bottom = view.originY + Math.max(0, view.contentHeight - view.height)
  if (index < view.count - 1 && item.y + item.height > view.contentY + view.height - reach)
    view.contentY = Math.min(bottom, item.y + item.height - view.height + reach)
  if (index > 0 && item.y < view.contentY + reach)
    view.contentY = Math.max(top, item.y - reach)
}
