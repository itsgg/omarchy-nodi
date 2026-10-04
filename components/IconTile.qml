import QtQuick
import qs.Commons

// A row's picture: a colour swatch, an app's or a theme's own image, or a
// font glyph on a soft tile.
Rectangle {
  id: tile
  property string glyph: ""
  property string glyphFont: ""
  property url imageSource: ""
  property bool fill: false             // a thumbnail: fills the tile, no plate
  property string swatch: ""
  property bool selected: false
  property real size: Style.space(30)
  property color foreground: Color.foreground
  property color selectedText: Color.foreground
  property string fontFamily: Style.font.family

  readonly property bool hasSwatch: /^#[0-9A-Fa-f]{6}$/.test(swatch)
  readonly property bool hasImage: !hasSwatch && String(imageSource) !== ""

  width: size
  height: size
  // An app's image sits inset on the same plate as a glyph, so app rows weigh
  // what the others do and a white icon keeps a plate on a light card.
  color: hasSwatch ? swatch : (hasImage && fill ? "transparent" : Util.alpha(selected ? selectedText : foreground, selected ? 0.16 : 0.07))
  border.width: hasSwatch ? 1 : 0
  border.color: Util.alpha(foreground, 0.3)

  Image {
    visible: tile.hasImage
    anchors.centerIn: parent
    width: tile.fill ? tile.size : Math.round(tile.size * 0.73)
    height: width
    sourceSize.width: width * 2
    sourceSize.height: height * 2
    fillMode: Image.PreserveAspectFit
    asynchronous: true
    smooth: true
    source: tile.hasImage ? tile.imageSource : ""
  }

  Text {
    visible: !tile.hasSwatch && !tile.hasImage
    anchors.centerIn: parent
    text: tile.glyph
    color: tile.selected ? tile.selectedText : tile.foreground
    font.family: tile.glyphFont || tile.fontFamily
    font.pixelSize: Math.round(tile.size * 0.56)
  }
}
