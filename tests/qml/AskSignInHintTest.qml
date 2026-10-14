import QtQuick
import "../../components"

// A sign-in failure outside an open permission card names the profile the
// selected agent actually uses. Codex's normal terminal profile is not Nodi's.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  Ask { id: codex; agent: "codex"; dataDir: "/test-home/.local/share/nodi" }
  Ask { id: claude; agent: "claude"; dataDir: "/test-home/.local/share/nodi" }
  Ask { id: noTool; agent: "claude"; acts: true; channel: "missing" }
  Ask { id: withTool; agent: "claude"; acts: true; channel: "ready"; toolServer: "/tmp/nodi" }

  function check(ok, what) { if (!ok) failures.push(what) }

  function start() {
    codex.signIn("Authentication required")
    claude.signIn("Authentication required")
    check(codex.phase === "error"
          && codex.error.indexOf("CODEX_HOME='/test-home/.local/share/nodi/profiles/codex' codex login") >= 0,
          "Codex pointed at its normal profile: " + codex.error)
    check(claude.phase === "error" && /run claude in a terminal/.test(claude.error),
          "Claude lost its ordinary command: " + claude.error)
    codex.proposal = { kind: "auth" }
    codex.deny()
    check(codex.error.indexOf("CODEX_HOME='/test-home/.local/share/nodi/profiles/codex' codex login") >= 0,
          "refusing Codex sign-in lost its private-profile command: " + codex.error)
    claude.agentAnswers("auth", { error: { message: "browser closed" } })
    check(/Signing in to Claude failed: browser closed.*run claude in a terminal/.test(claude.error),
          "failed Claude sign-in lost its command: " + claude.error)
    check(noTool.actionServerAvailable === false,
          "a missing action executable was advertised to Claude")
    check(withTool.actionServerAvailable === true,
          "an available action executable was hidden from Claude")
    done(failures.length === 0, failures.join("; "))
  }
}
