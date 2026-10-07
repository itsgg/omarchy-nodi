.pragma library
.import "../lib/Run.js" as Run
.import "../lib/Match.js" as Match
.import "../lib/Score.js" as Score

// Developer views (ROADMAP item 21, research 11, integrations 10 and 12):
//
//   a project's name             its git repository, or a folder zoxide knows:
//                                a terminal there; Ctrl+K editor, lazygit, Files
//   tmux, a session's name       attach to it in a terminal
//   ssh, a host's name           ssh to a Host of ~/.ssh/config in a terminal
//   man ls, tldr tar             the page, in a terminal
//   ports, port 8080             what listens on TCP: open it, or stop it
//   services, service backup     your user services: logs, restart, stop
//   h slack, history slack       Chromium's history: open a page again
//   prs, pr nodi                 open GitHub pull requests that involve you
//
// Each list comes through ctx.request; a terminal opens as Omarchy opens
// one, uwsm-app and xdg-terminal-exec, in the folder or with the command.

var LIMIT = 8

function terminal(dir, cmd) {
  var argv = ["uwsm-app", "--", "xdg-terminal-exec"]
  if (dir) argv.push("--dir=" + dir)
  if (cmd && cmd.length) argv = argv.concat(["--"], cmd)
  return Run.exec(argv)
}

function tilde(path, home) {
  return home && String(path).indexOf(home + "/") === 0 ? "~" + String(path).slice(home.length) : String(path)
}

// "git<TAB>/path" for a repository, "z<TAB>score<TAB>/path" for a folder
// zoxide knows; one entry per path, repositories first.
function parseProjects(text, ok) {
  var seen = Object.create(null)
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var p = lines[i].split("\t")
    var path = p[0] === "git" ? p[1] : p[0] === "z" ? p[2] : ""
    if (!path || path.charAt(0) !== "/" || seen[path]) continue
    seen[path] = true
    out.push({ path: path, name: path.split("/").pop() || path, git: p[0] === "git", score: p[0] === "z" ? Number(p[1]) || 0 : 0 })
  }
  return out
}

// `tmux list-sessions -F '#{session_id}<TAB>#{session_name}<TAB>#{session_windows}<TAB>#{session_attached}'`;
// no server running is no sessions, not an error. Attached by id ($N):
// a name holding a dot or a colon reads as session and window even after
// tmux's exact-match `=` (Fable 2026-10-02).
function parseTmux(text) {
  return String(text || "").split("\n").map(function(l) { return l.split("\t") }).filter(function(p) { return p.length >= 4 && /^\$\d+$/.test(p[0]) && p[1] })
    .map(function(p) { return { id: p[0], name: p[1], windows: Number(p[2]) || 0, attached: Number(p[3]) > 0 } })
}

// The words of an ssh_config line as ssh(1) reads them: split on spaces,
// a "quoted word" kept whole, a word starting with # ending the line.
function sshWords(text) {
  var out = []
  var i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text.charAt(i))) i++
    if (i >= text.length || text.charAt(i) === "#") break
    var word = ""
    if (text.charAt(i) === '"') {
      var end = text.indexOf('"', i + 1)
      if (end === -1) break
      word = text.slice(i + 1, end)
      i = end + 1
    } else {
      while (i < text.length && !/\s/.test(text.charAt(i))) word += text.charAt(i++)
    }
    out.push(word)
  }
  return out
}

// The Host names of ~/.ssh/config, patterns left out: "Host a b",
// "Host=a", "Host \"a\"", "Host a # a comment" (codex 2026-10-04).
function parseSsh(text) {
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*Host(?:\s*=\s*|\s+)(.*)$/i)
    if (!m) continue
    var names = sshWords(m[1])
    for (var j = 0; j < names.length; j++) if (names[j] && !/[*?!]/.test(names[j]) && out.indexOf(names[j]) === -1) out.push(names[j])
  }
  return out
}

// `ss -tlnpH`: "LISTEN 0 4096 127.0.0.1:8080 0.0.0.0:* users:(("node",pid=1,fd=2))".
// The process is shown only for your own sockets.
// One entry per port and program, with every address it listens on and
// every process of that program holding the socket: a pre-fork server
// (gunicorn, nginx) lists its master and workers, in no order to rely on.
// systemd holding a socket it activates is shown and never stopped: TERM to
// the user manager ends the session (Fable 2026-10-03).
function parsePorts(text) {
  var out = []
  var byKey = Object.create(null)
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 5 || f[0] !== "LISTEN") continue
    var local = f[3]
    var at = local.lastIndexOf(":")
    var port = Number(local.slice(at + 1))
    if (!(port > 0)) continue
    var addr = local.slice(0, at).replace(/%.*$/, "").replace(/^\[|\]$/g, "")
    var names = []
    var pidsOf = Object.create(null)
    var re = /\("([^"]*)",pid=(\d+)/g
    var m
    while ((m = re.exec(lines[i])) !== null) {
      if (!(m[1] in pidsOf)) { pidsOf[m[1]] = []; names.push(m[1]) }
      pidsOf[m[1]].push(Number(m[2]))
    }
    if (names.length > 1) names = names.filter(function(n) { return n !== "systemd" })
    if (names.length === 0) names = [""]
    for (var n = 0; n < names.length; n++) {
      var key = port + "/" + names[n]
      var e = byKey[key]
      if (!e) { e = byKey[key] = { port: port, name: names[n], addresses: [], pids: [] }; out.push(e) }
      if (e.addresses.indexOf(addr) === -1) e.addresses.push(addr)
      var mine = names[n] === "systemd" ? [] : (pidsOf[names[n]] || [])
      for (var h = 0; h < mine.length; h++) if (e.pids.indexOf(mine[h]) === -1) e.pids.push(mine[h])
    }
  }
  out.sort(function(a, b) { return a.port - b.port || (a.name < b.name ? -1 : 1) })
  return out
}

function where(addresses) {
  for (var i = 0; i < addresses.length; i++) if (/^(0\.0\.0\.0|::|\*)$/.test(addresses[i])) return "all addresses"
  return addresses[0] + (addresses.length > 1 ? " +" + (addresses.length - 1) : "")
}

// `systemctl --user list-units --type=service --all --no-legend --plain`.
// The unit keeps systemd's escapes ("app-gnome\x2dkeyring@autostart") for
// the commands, the name shows them undone; a unit never starts with a
// dash, which systemctl would read as an option.
var UNIT = /^[A-Za-z0-9@._:\\][A-Za-z0-9@._:\\-]*\.service$/
function parseServices(text) {
  var out = []
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/)
    if (!m || !UNIT.test(m[1])) continue
    var name = m[1].replace(/\.service$/, "").replace(/\\x([0-9a-fA-F]{2})/g, function(x, h) { return String.fromCharCode(parseInt(h, 16)) })
    out.push({ unit: m[1], name: name, load: m[2], active: m[3], sub: m[4], description: m[5] })
  }
  return out
}

// sqlite3 -json over Chromium's urls table: [{ url, title, visits, at }].
function parseHistory(text, ok) {
  if (!ok) throw "no browser history to read"
  var data = JSON.parse(String(text || "[]") || "[]")
  return (Array.isArray(data) ? data : []).filter(function(r) { return r && /^https?:\/\//.test(String(r.url)) })
    .map(function(r) { return { url: String(r.url), title: String(r.title || ""), visits: Number(r.visits) || 0, at: Number(r.at) || 0 } })
}

// A Chromium-family Bookmarks file: its folders walked, each bookmark with
// the folders it sits in ("Bookmarks bar > Work"), 5000 at most.
function parseBookmarks(text, ok) {
  if (!ok) throw "no bookmarks to read"
  var data = JSON.parse(String(text || "{}") || "{}")
  var out = []
  var walk = function(node, path) {
    if (!node || typeof node !== "object" || out.length >= 5000) return
    if (node.type === "url" && /^https?:\/\//.test(String(node.url))) { out.push({ title: String(node.name || ""), url: String(node.url), folder: path.join(" > ") }); return }
    var kids = Array.isArray(node.children) ? node.children : []
    for (var i = 0; i < kids.length; i++) walk(kids[i], node.name ? path.concat([String(node.name)]) : path)
  }
  var roots = data && data.roots && typeof data.roots === "object" ? data.roots : {}
  for (var r in roots) if (Object.prototype.hasOwnProperty.call(roots, r)) walk(roots[r], [])
  return out
}

// What was typed, as a page to open (ROADMAP 55): a URL with its scheme,
// or a bare domain with a known ending, localhost or an IP, a port and a
// path allowed; https unless it is local. "" for anything else: "notes.md"
// and "build.sh" are files, those endings left out. Some endings are both a
// site's and a file type's (wikipedia.org, notes.org): such a bare name is
// a site ranked as a keyword names a thing to open (fileLike), under a
// window its title names ("notes.org" in an editor), and a guess: the
// fallbacks ("Find files named main.cc") come under it (Fable 2026-10-06).
var TLDS = /^(com|org|net|io|dev|app|ai|co|me|info|biz|gov|edu|uk|de|fr|in|jp|cn|ru|br|au|ca|us|eu|nl|se|no|es|it|ch|at|be|pl|xyz|site|online|tech|gg|tv|fm|ly|so|to|cc|is|lk|sg|nz|ie|dk|fi|pt|kr|tw|hk|mx|ar|za|il|ae|cloud|page|blog|news|wiki)$/
// A bare name whose ending is also a file type's (org-mode, C++, Perl, a
// shared library, autoconf, Illustrator, a bundle, info, a wiki page), and
// nothing else (a path, a port, www., a scheme) says it is a site (Fable
// 2026-10-06).
var FILE_ENDINGS = /^(org|cc|pl|so|in|ai|app|info|wiki)$/
function fileLike(text) {
  var t = String(text || "").trim().toLowerCase()
  return !/^https?:\/\//.test(t) && !/^www\./.test(t) && t.indexOf("/") === -1 && t.indexOf(":") === -1 && FILE_ENDINGS.test(t.split(".").pop())
}

function typedUrl(text) {
  var t = String(text || "").trim()
  if (!t || /\s/.test(t)) return ""
  if (/^https?:\/\/[^\s\/]+/i.test(t)) return t
  var m = t.match(/^((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d{1,5})?(\/\S*)?$/i)
  if (!m) return ""
  var host = m[1].toLowerCase()
  // An IP is four numbers to 255, not a name that starts with a digit
  // ("1password.com" is a site, "1.5.md" a file; Fable 2026-10-06).
  var ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && host.split(".").every(function(n) { return Number(n) <= 255 })
  var local = host === "localhost" || ip
  // Numbers before the ending read as a version ("2.0.app", "1.5.md").
  var labels = host.split(".")
  if (!local && (labels.slice(0, -1).every(function(l) { return /^\d+$/.test(l) }) || !TLDS.test(labels[labels.length - 1]))) return ""
  return (local ? "http://" : "https://") + t
}

function bookmarkRows(q, ctx, all) {
  var got = ctx.request ? ctx.request("bookmarks") : { state: "pending" }
  // No Bookmarks file reads as none saved (the read prints {}); an error
  // is one: a file that cannot be read or does not parse (Fable 2026-10-06).
  if (!got.value) return all ? [{ title: got.state === "error" ? "Could not read the bookmarks" : "Reading bookmarks...",
                                  subtitle: "Bookmarks", score: 40, copy: "", remember: false }] : []
  var hits = []
  for (var i = 0; i < got.value.length; i++) {
    var b = got.value[i]
    // By its title and its site; its folder shows, and matches nothing:
    // "bar" is no bookmark of "Bookmarks bar" (Fable 2026-10-06).
    var t = !q ? "prefix" : Score.tier(q, { name: b.title || host(b.url), whole: true, keywords: [host(b.url)] })
    if (t) hits.push({ b: b, t: t })
  }
  hits.sort(function(x, y) { return Score.ORDER.indexOf(x.t) - Score.ORDER.indexOf(y.t) })
  var limit = all ? 30 : 3
  var out = hits.slice(0, limit).map(function(h, n) {
    return { key: "bookmark:" + h.b.url, title: h.b.title || host(h.b.url), subtitle: host(h.b.url) + (h.b.folder ? ", " + h.b.folder : ""),
             icon: "󰃀", tier: h.t, kind: "item", offset: -n * 0.001, copy: h.b.url, run: Run.open(h.b.url), actionLabel: "Open", group: "Bookmarks" }
  })
  if (all && out.length === 0) return [{ title: q ? "No bookmark matches " + q : "No bookmarks saved", subtitle: q ? "Bookmarks" : "None in Chromium, Brave or Chrome",
                                         score: 40, copy: "", remember: false }]
  return out
}

// gh search prs --json: [{ number, title, repository: { nameWithOwner }, url, author: { login } }].
function parsePrs(text, ok) {
  if (!ok) throw "gh could not search"
  var data = JSON.parse(String(text || "[]") || "[]")
  return (Array.isArray(data) ? data : []).filter(function(p) { return p && /^https:\/\//.test(String(p.url)) })
    .map(function(p) { return { number: Number(p.number) || 0, title: String(p.title || ""), repo: String((p.repository && p.repository.nameWithOwner) || ""),
                                url: String(p.url), author: String((p.author && p.author.login) || "") } })
}

function host(url) {
  var m = String(url).match(/^https?:\/\/([^\/?#]+)([^?#]*)/)
  return m ? m[1].replace(/^www\./, "") + (m[2] && m[2] !== "/" ? m[2] : "") : String(url)
}

// Where to open what listens. localhost where both families listen (ss's
// "*", or both loopbacks, or both wildcards); else the loopback of the one
// family that does (0.0.0.0 and 127.0.0.1 are 127.0.0.1, :: and ::1 are
// [::1]), as a browser may take localhost for either, and a server on one
// family's loopback was reached through the other's (codex 2026-10-05);
// any other address is itself, an IPv6 one in brackets, so a server on
// 192.168.1.20 alone or on 127.0.0.53 is reached where it listens (codex
// 2026-10-04).
function hostFor(addresses) {
  var a = addresses || []
  var v4 = false
  var v6 = false
  for (var i = 0; i < a.length; i++) {
    var x = String(a[i])
    if (x === "*" || x === "") { v4 = true; v6 = true }
    else if (x === "0.0.0.0" || x === "127.0.0.1") v4 = true
    else if (x === "::" || x === "::1") v6 = true
  }
  if (v4 && v6) return "localhost"
  if (v4) return "127.0.0.1"
  if (v6) return "[::1]"
  var first = String(a[0] || "localhost")
  return first.indexOf(":") !== -1 ? "[" + first + "]" : first
}

function portRows(q, ctx) {
  var got = ctx.request ? ctx.request("ports") : { state: "pending" }
  if (!got.value) return [{ title: got.state === "error" ? "Could not read ports" : "Reading ports...", subtitle: "Ports", score: 40, copy: "", remember: false }]
  var want = q.replace(/^:/, "")
  var out = []
  for (var i = 0; i < got.value.length; i++) {
    var p = got.value[i]
    if (want && String(p.port).indexOf(want) !== 0 && Match.fold(p.name).indexOf(want) !== 0) continue
    var held = p.name === "systemd" ? ", socket activated" : p.pids.length === 1 ? ", pid " + p.pids[0]
             : p.pids.length > 1 ? ", " + p.pids.length + " processes" : ", another user's"
    var at = hostFor(p.addresses) + ":" + p.port
    var row = { key: "port:" + p.port + "/" + p.name, title: ":" + p.port + (p.name ? " " + p.name : ""),
      subtitle: where(p.addresses) + held, icon: "󰌘",
      score: 97 - i * 0.01, copy: at, remember: false, group: "Ports",
      run: Run.open("http://" + at), actionLabel: "Open",
      actions: [{ label: "Copy the address", icon: "󰆏", run: Run.copy(at) }] }
    if (p.pids.length) row.actions.push({ label: "Stop " + (p.name || "the process"), icon: "󰅖", confirm: true,
                                          run: Run.exec(["kill", "-TERM", "--"].concat(p.pids.map(String))) })
    out.push(row)
  }
  return out.length ? out : [{ title: "Nothing listens on " + q, subtitle: "Ports", score: 40, copy: "", remember: false }]
}

function serviceRows(q, ctx) {
  var got = ctx.request ? ctx.request("services") : { state: "pending" }
  if (!got.value) return [{ title: got.state === "error" ? "Could not read your services" : "Reading services...", subtitle: "Services", score: 40, copy: "", remember: false }]
  var out = []
  for (var i = 0; i < got.value.length; i++) {
    var s = got.value[i]
    var t = q ? Score.tier(q, { name: s.name, whole: true, description: s.description }) : "words"
    if (!t) continue
    var running = s.active === "active"
    out.push({ key: "service:" + s.unit, title: s.name, subtitle: s.active + " (" + s.sub + ")" + (s.description ? ", " + s.description : ""),
      badge: running ? "ON" : "", badgeTone: running ? "on" : "", icon: "󰒓", tier: t, kind: "item",
      offset: running ? 0 : -0.2, copy: s.unit, group: "Services", remember: false,
      run: terminal("", ["journalctl", "--user", "-u", s.unit, "-n", "200", "-f"]), actionLabel: "Logs",
      actions: [
        { label: "Restart", icon: "󰑓", run: Run.exec(["systemctl", "--user", "restart", "--", s.unit]) },
        running ? { label: "Stop", icon: "󰓛", confirm: true, run: Run.exec(["systemctl", "--user", "stop", "--", s.unit]) }
                : { label: "Start", icon: "󰐊", run: Run.exec(["systemctl", "--user", "start", "--", s.unit]) },
        { label: "Status in a terminal", icon: "󰆍", run: terminal("", ["systemctl", "--user", "status", "--", s.unit]) }
      ] })
  }
  return out.length ? out : [{ title: "No user service named " + q, subtitle: "Services", score: 40, copy: "", remember: false }]
}

function historyRows(q, ctx) {
  if (!q) return [{ title: "Browser history", subtitle: "Chromium, Brave or Chrome", score: 40, copy: "", remember: false, hint: "h <words>" }]
  var got = ctx.request ? ctx.request("browser-history") : { state: "pending" }
  if (!got.value) return [{ title: got.state === "error" ? "No browser history to read" : "Reading history...", subtitle: "Browser history", score: 40, copy: "", remember: false }]
  var words = q.split(" ")
  var hits = got.value.filter(function(r) {
    var hay = Match.folded(r.title + " " + r.url)
    return words.every(function(w) { return hay.indexOf(w) !== -1 })
  })
  hits.sort(function(a, b) { return b.visits - a.visits || b.at - a.at })
  if (hits.length === 0) return [{ title: "No page in your history matches " + q, subtitle: "Browser history", score: 40, copy: "", remember: false }]
  return hits.slice(0, 30).map(function(r, i) {
    return { key: "history:" + r.url, title: r.title || host(r.url), subtitle: host(r.url) + (r.visits > 1 ? ", " + r.visits + " visits" : ""),
             icon: "󰋚", score: 97 - i * 0.01, copy: r.url, run: Run.open(r.url), actionLabel: "Open", group: "Browser history", remember: false }
  })
}

function prRows(q, ctx) {
  var got = ctx.request ? ctx.request("prs") : { state: "pending" }
  // Said once (the parser's reason was appended to the same words); gh
  // fails this way when it is signed out or offline.
  if (!got.value) return [got.state === "error"
    ? { title: "gh could not search", subtitle: "Pull requests; gh auth login signs gh in", score: 40, copy: "", remember: false }
    : { title: "Asking GitHub...", subtitle: "Pull requests", score: 40, copy: "", remember: false }]
  var out = []
  for (var i = 0; i < got.value.length; i++) {
    var p = got.value[i]
    var hay = Match.folded(p.title + " " + p.repo + " " + p.number)
    if (q && q.split(" ").some(function(w) { return hay.indexOf(w) === -1 })) continue
    out.push({ key: "pr:" + p.url, title: "#" + p.number + " " + p.title, subtitle: p.repo + (p.author ? ", by " + p.author : ""),
               icon: "󰐅", score: 97 - out.length * 0.01, copy: p.url, run: Run.open(p.url), actionLabel: "Open", group: "Pull requests", remember: false })
  }
  return out.length ? out : [{ title: q ? "No open pull request matches " + q : "No open pull requests involve you", subtitle: "Pull requests", score: 40, copy: "", remember: false }]
}

// Each view's words, shared by its mode and by match so a trailing space
// cannot leave a mode with no rows. A bare "port" or "pr" needs a space
// after it, or typing "portal" or "print" would pass through the view.
var PORTS = /^\s*(?:ports|port(?=\s))(?:\s+(.*))?$/i
var SERVICES = /^\s*(?:services|systemctl|service(?=\s))(?:\s+(.*))?$/i
var HISTORY = /^\s*(?:h|history)\s+(.*)$/i
var PRS = /^\s*(?:prs|pull\s+requests?|pr(?=\s))(?:\s+(.*))?$/i
var BOOKMARKS = /^\s*(?:bm|bookmarks?)(?:\s+(.*))?$/i

function rest(m) { return Match.normalise(m[1]) }

function projectRows(q, ctx, home) {
  var got = ctx.request ? ctx.request("projects") : { state: "pending" }
  var list = Array.isArray(got.value) ? got.value : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    var t = Score.tier(q, { name: p.name, whole: true, keywords: [p.git ? "project repo repository git" : "folder"], context: tilde(p.path, home) })
    if (!t) continue
    var actions = [
      { label: "Open in your editor", icon: "󰨞", run: Run.exec(["omarchy-launch-editor", p.path]) },
      { label: "Open in Files", icon: "󰉋", run: Run.open(p.path) },
      { label: "Copy the path", icon: "󰆏", run: Run.copy(p.path) }
    ]
    if (p.git) actions.splice(1, 0, { label: "Open in lazygit", icon: "󰊢", run: terminal(p.path, ["lazygit"]) })
    out.push({
      key: "project:" + p.path, title: p.name, subtitle: tilde(p.path, home) + (p.git ? ", git" : ""),
      icon: p.git ? "󰊢" : "󰉋", tier: t, kind: "item", offset: (p.git ? 0 : -0.5) + Math.min(0.4, p.score / 100),
      copy: p.path, run: terminal(p.path), actionLabel: "Terminal", actions: actions, group: "Projects"
    })
  }
  return out
}

function tmuxRows(q, ctx, all) {
  var got = ctx.request ? ctx.request("tmux") : { state: "pending" }
  var list = Array.isArray(got.value) ? got.value : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var s = list[i]
    var t = all ? "words" : Score.tier(q, { name: s.name, whole: true, keywords: ["tmux", "session"] })
    if (!t) continue
    out.push({
      key: "tmux:" + s.name, title: s.name, subtitle: "tmux, " + s.windows + (s.windows === 1 ? " window" : " windows") + (s.attached ? ", attached" : ""),
      icon: "󰆍", tier: t, kind: "item", copy: s.name, run: terminal("", ["tmux", "attach-session", "-t", s.id]),
      // Not remembered: a session id is tmux's for this server only, and a
      // replay after a restart attached another session (codex 2026-10-04).
      remember: false, actionLabel: "Attach", group: "tmux"
    })
  }
  return out
}

function sshRows(q, ctx, all) {
  var got = ctx.request ? ctx.request("ssh") : { state: "pending" }
  var list = Array.isArray(got.value) ? got.value : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var h = list[i]
    var t = all ? "words" : Score.tier(q, { name: h, whole: true, keywords: ["ssh", "host", "server"] })
    if (!t) continue
    out.push({ key: "ssh:" + h, title: h, subtitle: "SSH", icon: "󰒋", tier: t, kind: "item", copy: h,
               run: terminal("", ["ssh", "--", h]), actionLabel: "Connect", group: "SSH" })
  }
  return out
}

var provider = {
  id: "dev",
  name: "Developer",
  icon: "󰅩",
  sources: {
    projects: {
      argv: function(param, env) {
        return ["/usr/bin/bash", "-c",
          'for r in "$HOME/Work" "$HOME/Projects" "$HOME/Code" "$HOME/src" "$HOME/dev"; do [ -d "$r" ] && find "$r" -maxdepth 4 -name .git -prune -printf "git\\t%h\\n" 2>/dev/null; done; '
          + 'command -v zoxide >/dev/null && zoxide query --list --score 2>/dev/null | head -n 60 | awk \'{ s = $1; print "z\\t" s "\\t" substr($0, index($0, $2)) }\'; true']
      },
      parse: parseProjects,
      maxAgeMs: 60 * 1000,
      timeoutMs: 4000
    },
    tmux: {
      argv: function() { return ["/usr/bin/bash", "-c", "tmux list-sessions -F '#{session_id}\t#{session_name}\t#{session_windows}\t#{session_attached}' 2>/dev/null; true"] },
      parse: parseTmux,
      maxAgeMs: 3000,
      timeoutMs: 2000
    },
    ssh: {
      argv: function() { return ["/usr/bin/bash", "-c", 'cat -- "$HOME/.ssh/config" 2>/dev/null; true'] },
      parse: parseSsh,
      maxAgeMs: 60 * 1000,
      timeoutMs: 2000
    },
    ports: {
      argv: function() { return ["/usr/bin/ss", "-tlnpH"] },
      parse: parsePorts,
      maxAgeMs: 2000,
      timeoutMs: 2000
    },
    services: {
      argv: function() { return ["/usr/bin/systemctl", "--user", "list-units", "--type=service", "--all", "--no-legend", "--plain", "--no-pager"] },
      parse: parseServices,
      maxAgeMs: 2000,
      timeoutMs: 3000
    },
    // The first Chromium-family history found, read without locking the
    // browser that writes it (immutable=1), newest 3000 pages. A plain
    // read-only open fails while Chromium runs, "database is locked", since
    // it holds the file in exclusive locking mode, and so would a backup;
    // a read that catches the file mid-write can return wrong or missing
    // rows, or fail, and what it returned stands until history is searched
    // again after the minute its rows are kept (codex 2026-10-04 asked for
    // locking; 2026-10-05, that this is a risk taken, not removed).
    "browser-history": {
      argv: function() {
        return ["/usr/bin/bash", "-c",
          'for f in "$HOME/.config/chromium/Default/History" "$HOME/.config/BraveSoftware/Brave-Browser/Default/History" "$HOME/.config/google-chrome/Default/History"; do '
          + '[ -f "$f" ] && exec sqlite3 -readonly -json "file:$f?immutable=1" "select url, title, visit_count as visits, last_visit_time as at from urls order by last_visit_time desc limit 3000"; '
          + 'done; exit 1']
      },
      parse: parseHistory,
      maxAgeMs: 60 * 1000,
      // A read that lands mid-commit can fail; it heals at the next one.
      retryMs: 5000,
      timeoutMs: 4000,
      maxBytes: 8388608
    },
    // The first Chromium-family bookmarks found (a plain JSON file), kept a
    // minute: at root and under `bm` (ROADMAP 55).
    bookmarks: {
      argv: function() {
        return ["/usr/bin/bash", "-c",
          'for f in "$HOME/.config/chromium/Default/Bookmarks" "$HOME/.config/BraveSoftware/Brave-Browser/Default/Bookmarks" "$HOME/.config/google-chrome/Default/Bookmarks"; do '
          + '[ -f "$f" ] && exec cat -- "$f"; done; printf "{}"']
      },
      parse: parseBookmarks,
      maxAgeMs: 60 * 1000,
      retryMs: 60 * 1000,
      timeoutMs: 3000,
      maxBytes: 8388608
    },
    // Network-bound (about 2 s): asked only under `prs`, kept ten minutes.
    prs: {
      argv: function() { return ["/usr/bin/bash", "-lc", "exec gh search prs --involves=@me --state=open --json number,title,repository,url,author --limit 30"] },
      parse: parsePrs,
      maxAgeMs: 10 * 60 * 1000,
      retryMs: 2 * 60 * 1000,
      timeoutMs: 15000
    }
  },
  modes: [
    { pattern: PORTS, label: "Ports", icon: "󰌘", exclusive: true, hint: "ports [port or program]" },
    { pattern: SERVICES, label: "Services", icon: "󰒓", exclusive: true, hint: "services [name]" },
    { pattern: HISTORY, label: "History", icon: "󰋚", exclusive: true, hint: "h <words>" },
    { pattern: PRS, label: "Pull requests", icon: "󰐅", exclusive: true, hint: "prs [words]" },
    { pattern: BOOKMARKS, label: "Bookmarks", icon: "󰃀", exclusive: true, hint: "bm [words]" }
  ],
  commands: [
    { title: "tmux sessions", keywords: "tmux sessions attach terminal", text: "Attach to one", complete: "tmux" },
    { title: "Listening ports", keywords: "ports port listening listen server localhost", text: "What listens, and its process", complete: "ports" },
    { title: "User services", keywords: "services service systemd systemctl units daemon", text: "Logs, restart, stop", complete: "services" },
    { title: "Browser history", keywords: "history browser chromium pages visited", text: "A page you visited, by its words", complete: "h " },
    { title: "Pull requests", keywords: "pull requests prs github review", text: "Open ones that involve you", complete: "prs" },
    { title: "Bookmarks", keywords: "bookmarks bookmark favourites saved pages", text: "A saved page, by its words", complete: "bm " }
  ],
  help: [
    { id: "dev", title: "Developer", icon: "󰅩", about: "Projects, sessions, hosts, pages, ports, services, history, bookmarks, pull requests",
      examples: [{ q: "nodi", note: "A project by its folder's name" }, { q: "tmux" }, { q: "ssh " }, { q: "man ls" }, { q: "tldr tar" },
                 { q: "ports" }, { q: "services" }, { q: "h github" }, { q: "prs" }, { q: "bm " }, { q: "github.com", note: "A site, opened as typed" }] }
  ],
  match: function(query, ctx) {
    var home = String(ctx.home || "")
    var q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ")
    var m
    if ((m = String(query).match(PORTS))) return portRows(rest(m), ctx)
    if ((m = String(query).match(SERVICES))) return serviceRows(rest(m), ctx)
    if ((m = String(query).match(HISTORY))) return historyRows(rest(m), ctx)
    if ((m = String(query).match(PRS))) return prRows(rest(m), ctx)
    if ((m = String(query).match(BOOKMARKS))) return bookmarkRows(rest(m), ctx, true)
    // A typed site, opened as it is typed: over the rest, as an answer is.
    var url = typedUrl(query)
    if (url) {
      var site = { key: "url:" + url, title: "Open " + String(query).trim(), subtitle: url.replace(/^https?:\/\//, "").split(/[\/?#]/)[0],
                   icon: "󰖟", copy: url, run: Run.open(url), actionLabel: "Open", remember: false }
      if (fileLike(query)) { site.tier = "keyword"; site.kind = "item"; site.guess = true } else site.score = 99
      return [site]
    }
    var page = String(query).match(/^\s*(man|tldr)\s+([A-Za-z0-9._+-]+)(?:\s+([0-9a-z]+))?\s*$/)
    if (page) {
      var cmd = page[1] === "man" ? (page[3] ? ["man", "--", page[3], page[2]] : ["man", "--", page[2]]) : ["tldr", "--", page[2]]
      return [{ key: page[1] + ":" + page[2], title: (page[1] === "man" ? "Manual: " : "tldr: ") + page[2] + (page[3] ? "(" + page[3] + ")" : ""),
                subtitle: "In a terminal", icon: "", score: 98, copy: page[2], run: terminal("", cmd), remember: false }]
    }
    if (q.length < 3) return []
    var rows = []
    if (q === "tmux" || q.indexOf("tmux ") === 0) rows = rows.concat(tmuxRows(q.replace(/^tmux ?/, ""), ctx, q === "tmux"))
    else rows = rows.concat(tmuxRows(q, ctx, false))
    if (q === "ssh" || q.indexOf("ssh ") === 0) rows = rows.concat(sshRows(q.replace(/^ssh ?/, ""), ctx, q === "ssh"))
    else rows = rows.concat(sshRows(q, ctx, false))
    // Ranked before the cut: the first eight found were not the best named
    // (codex 2026-10-04).
    var projects = projectRows(q, ctx, home)
    projects.sort(function(a, b) { return (Score.score(b.tier, b.kind) + b.offset) - (Score.score(a.tier, a.kind) + a.offset) })
    rows = rows.concat(projects.slice(0, LIMIT))
    rows = rows.concat(bookmarkRows(q, ctx, false))
    return rows
  }
}
