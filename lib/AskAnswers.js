.pragma library
.import "Acp.js" as Acp

// What the agent's answer to one of Nodi's requests decides
// (components/Ask.qml agentAnswers): whether the start goes on, and why
// it failed in words he reads; and how a question's turn ends. Ask keeps
// the dispatch, its timers and the requests it sends next.

// The agent's reason for an error, "" for none.
function why(m) {
  return m && m.error ? m.error.message || ("error " + m.error.code) : ""
}

// What a request's error says, by what was asked. `hint` is how he signs
// in himself (Ask's signInHint), said after a failed sign-in.
function failure(kind, reason, name, hint) {
  var k = String(kind)
  if (k === "init") return name + " did not start: " + reason
  if (k === "session") return name + " could not start a session: " + (reason || "no session")
  if (k === "close:resume") return name + " could not close the current session: " + reason
  if (k === "resume") return name + " could not resume the session: " + reason
  if (k.indexOf("config:") === 0) return name + " could not set its " + k.slice(7) + ": " + reason
  if (k === "auth") return "Signing in to " + name + " failed: " + reason + (hint || "")
  return reason
}

// initialize answered: the agent's capabilities, or why it cannot be held.
function started(m, name) {
  var reason = why(m)
  if (reason) return { fail: failure("init", reason, name) }
  var caps = Acp.capabilities(m.result)
  if (caps.version !== Acp.VERSION)
    return { fail: name + " speaks ACP " + caps.version + "; Nodi speaks " + Acp.VERSION }
  return { caps: caps }
}

// session/new answered: a session, a sign-in it needs, or why not.
function opened(m, name) {
  var reason = why(m)
  if (m.error && m.error.code === Acp.AUTH_REQUIRED) return { signIn: reason }
  if (reason || !m.result || typeof m.result.sessionId !== "string")
    return { fail: failure("session", reason, name) }
  return { sessionId: m.result.sessionId }
}

// session/prompt answered: the turn's end. `t` is
//   { answer, refused, answerMax, proposal }
// and the result either fails the question, in the agent's own first line
// when it said why before failing (Codex says "out of credits", then fails
// with "Internal error"), or gives the answer as shown and the phase after.
function ended(m, t) {
  var reason = why(m)
  if (reason) return { fail: t.answer.trim() ? t.answer.trim().split("\n")[0].slice(0, 300) : reason }
  var stop = Acp.stopped(m.result && m.result.stopReason)
  if (stop && !t.answer) return { fail: stop }
  var answer = t.answer
  if (stop) answer += "\n\n(" + stop + ")"
  if (t.refused.length) answer = Acp.withRefused(answer, t.refused, t.answerMax)
  // A row the bar's run showed waits for him after the answer ends.
  return { answer: answer, phase: t.proposal ? "proposing" : "done" }
}
