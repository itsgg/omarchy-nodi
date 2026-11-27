import Quickshell.Io
import QtQuick
import "../lib/Jsonc.js" as Jsonc
import "../lib/Config.js" as Config

// Nodi's settings: config.default.json beside the plugin and his nodi.json,
// each watched, merged into `config` (lib/Config.js). Nodi.qml reads
// `config` and is told, by signal, when both files are first in (`ready`)
// and when a nodi.json has been read whole.
Item {
  id: files
  visible: false

  property string pluginDir: ""
  property string home: ""
  property string runtimeDir: ""
  readonly property string userConfigPath: files.home + "/.config/omarchy/extensions/nodi.json"

  property var defaultConfig: ({})
  property var userConfig: ({})
  property bool userConfigGood: false   // a nodi.json has parsed since load
  property string configWarned: ""      // the error last notified, so each is said once
  readonly property var config: Config.merge(files.defaultConfig, files.userConfig, files.pluginDir,
                                              { home: files.home, runtimeDir: files.runtimeDir })

  // Both files read once, each counted by itself: nothing that depends on
  // the settings (the hotkey, the reads ahead) is asked for before.
  property bool ready: false
  property bool defaultConfigSeen: false
  property bool userConfigSeen: false

  // Both files are in, the first time (`ready` is set).
  signal bothRead()
  // A nodi.json was read whole and taken.
  signal userRead()
  // What Nodi says in its toast.
  signal warn(string title, string body)

  function configLoaded(which) {
    if (which === "default") files.defaultConfigSeen = true
    if (which === "user") files.userConfigSeen = true
    if (files.defaultConfigSeen && files.userConfigSeen && !files.ready) {
      files.ready = true
      files.bothRead()
      if (files.configPending) { var e = files.configPending; files.configPending = ""; files.configError(e) }
    }
  }

  FileView {
    path: files.pluginDir + "/config.default.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      try { files.defaultConfig = Jsonc.parse(text()) } catch (e) { console.warn("nodi: bad config.default.json: " + e) }
      files.configLoaded("default")
    }
    onFileChanged: reload()
  }

  // A nodi.json that does not parse never takes effect: the last good one
  // stays, or the defaults at startup, and a notification says so once.
  // After startup a change is read again once it has settled, so an editor
  // that empties the file and then writes it is read whole, not halfway.
  function userConfigRead(text) {
    var r = Config.read(text)
    if (r.error) files.configError(r.error)
    else {
      files.userConfig = r.config; files.userConfigGood = true; files.configWarned = ""
      files.userRead()
    }
    files.configLoaded("user")
  }

  Timer { id: userConfigSettle; interval: 300; onTriggered: userConfigFile.reload() }

  FileView {
    id: userConfigFile
    path: files.userConfigPath
    watchChanges: true
    printErrors: false
    onLoaded: files.userConfigRead(text())
    // No file is no settings; one that cannot be read is an error.
    onLoadFailed: function(error) {
      if (error === FileViewError.FileNotFound) files.userConfigRead("")
      else {
        files.configError(error === FileViewError.PermissionDenied ? "it cannot be read: permission denied"
          : error === FileViewError.NotAFile ? "it is not a file" : "it cannot be read")
        files.configLoaded("user")
      }
    }
    onFileChanged: { if (files.ready) userConfigSettle.restart(); else reload() }
  }

  // Said once both config files are in, so the default hotkey it names is known.
  property string configPending: ""

  function configError(error) {
    console.warn("nodi: " + files.userConfigPath + ": " + error)
    if (!files.ready) { files.configPending = error; return }
    if (files.configWarned === error) return
    files.configWarned = error
    var keeping = files.userConfigGood ? "Keeping the last settings that worked."
      : "Using the defaults until it is fixed; the hotkey is " + String(files.config.hotkey || "") + "."
    files.warn("nodi.json has an error", error + ". " + keeping)
  }
}
