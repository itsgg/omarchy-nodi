import QtQuick
import "../../components"

Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []
  property int round: 0
  property int commits: 0
  property string fixture: Qt.resolvedUrl("interaction-agent.py").toString().replace(/^file:\/\//, "")

  function check(value, message) { if (!value) failures.push(message) }

  Ask {
    id: ask
    agent: "plain"
    program: ["/usr/bin/python", test.fixture]
    workDir: "/tmp"
    shown: true
    committer: function(snapshot) {
      test.commits++
      test.check(snapshot && snapshot.run
        && snapshot.run.argv.join(" ") === "true",
        "metadata command changed: " + JSON.stringify(snapshot))
      return { status: "executed", key: snapshot.key, title: snapshot.title }
    }

    onStageChanged: {
      if (test.round === 3 && stage === "ready" && sessionId === "saved-1") {
        test.round = 4
        send("resumed")
      }
    }

    onPhaseChanged: {
      if (phase === "proposing" && proposal && proposal.kind === "elicitation") {
        test.check(form && form.fields.length === 1 && form.fields[0].name === "strategy",
                   "the bounded form was not exposed: " + JSON.stringify(form))
        setFormField("strategy", "fast")
        Qt.callLater(submitForm)
        return
      }
      if (phase === "proposing" && proposal
          && proposal.kind === "metadataAction") {
        Qt.callLater(allow)
        return
      }
      if (phase === "proposing" && proposal
          && proposal.kind === "command") {
        test.check(form && form.fields.length === 1
          && form.fields[0].name === "input",
          "command form was not exposed: " + JSON.stringify(form))
        setFormField("input", "workspace")
        Qt.callLater(submitForm)
        return
      }
      if (phase !== "done" && phase !== "error") return
      if (phase === "error") {
        test.failures.push("interaction ask failed: " + error)
        deadline.stop()
        test.done(false, test.failures.join("; "))
        return
      }
      if (test.round === 0) {
        test.check(answer === "done", "elicitation result: " + answer)
        test.check(commands.length === 2 && commands[0].name === "status", "commands: " + JSON.stringify(commands))
        test.check(plans.length === 1 && plans[0].content === "Inspect", "plan: " + JSON.stringify(plans))
        test.check(resultActions.length === 3 && resultActions[2].title === "Run", "actions: " + JSON.stringify(resultActions))
        test.check(remoteSessions.length === 1 && remoteSessions[0].sessionId === "saved-1", "sessions: " + JSON.stringify(remoteSessions))
        test.round = 10
        test.check(proposeResultAction(2), "metadata executable was not proposed")
        return
      }
      if (test.round === 10) {
        test.check(test.commits === 1, "metadata executable did not commit once")
        test.round = 1
        test.check(openedLink("https://example.test", completedTurn), "answer link was not reported")
        send("linkcheck")
        return
      }
      if (test.round === 1) {
        test.check(answer === "opened=yes@session-1", "opened link notification: " + answer)
        test.round = 2
        runCommand("status")
        return
      }
      if (test.round === 2) {
        test.check(answer === "/status@session-1", "agent command: " + answer)
        test.round = 20
        test.check(runCommand("review"), "input command was not proposed")
        return
      }
      if (test.round === 20) {
        test.check(answer === "/review workspace@session-1",
                   "input command: " + answer)
        test.round = 3
        test.check(resumeRemote(0), "saved session was not resumable")
        return
      }
      if (test.round === 4) {
        test.check(answer === "resumed@saved-1", "saved session did not resume: " + answer)
        test.round = 5
        recycle()
        send("second")
        return
      }
      test.check(answer === "second@session-2", "new ACP session did not reuse the process: " + answer)
      deadline.stop()
      test.done(test.failures.length === 0, test.failures.join("; "))
    }
  }

  Timer {
    id: deadline
    interval: 10000
    onTriggered: test.done(false, "interaction test timed out: " + ask.phase + " " + ask.error)
  }

  function start() {
    deadline.start()
    ask.send("interactions")
  }
}
