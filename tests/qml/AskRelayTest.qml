import QtQuick
import "../../components"

// The Ask relay mailbox without an agent process: transport tickets are
// one-shot, while request outcomes survive transport cancellation for replay.
Item {
  id: test
  signal done(bool ok, string report)
  property var failures: []

  function check(ok, what) { if (!ok) test.failures.push(what) }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
  function finalResponse(id, status) {
    return {
      jsonrpc: "2.0", id: id,
      result: { content: [{ type: "text", text: JSON.stringify({ status: status }) }] }
    }
  }
  function status(response) {
    try { return JSON.parse(response.result.content[0].text).status }
    catch (e) { return "" }
  }

  Ask {
    id: mailbox
    program: ["/usr/bin/true"]
  }

  function start() {
    mailbox.token = "token"
    mailbox.channel = "channel"
    if (typeof mailbox.markToolResponseCommitted !== "function"
        || typeof mailbox.toolResponseFor !== "function") {
      test.done(false, "mailbox has no explicit commit/request-outcome API")
      return
    }

    var readyTicket = mailbox.pendingToolResponse(1)
    var ready = finalResponse(1, "executed")
    check(mailbox.completeToolResponse(1, JSON.stringify(ready)) === true, "first completion lost")
    check(mailbox.completeToolResponse(1, JSON.stringify(finalResponse(1, "failed"))) === false,
          "duplicate completion replaced the outcome")
    check(same(mailbox.pollToolResponse(readyTicket), ready), "ready response not returned")
    check(mailbox.pollToolResponse(readyTicket).error.code === -32603, "ticket returned its response twice")
    check(same(mailbox.toolResponseFor(1), ready), "one-shot poll discarded the request outcome")

    var preTicket = mailbox.pendingToolResponse("pre")
    check(mailbox.cancelToolResponse(preTicket) === true, "pre-commit cancellation did not win")
    check(mailbox.toolResponses[preTicket] === undefined, "cancelled transport ticket was retained")
    check(mailbox.cancelToolResponse(preTicket) === false, "duplicate cancel won")
    check(status(mailbox.toolResponseFor("pre")) === "refused", "pre-commit cancel did not publish refused")
    check(mailbox.completeToolResponse("pre", JSON.stringify(finalResponse("pre", "executed"))) === false,
          "completion replaced a pre-commit refusal")

    var postTicket = mailbox.pendingToolResponse("post")
    check(mailbox.markToolResponseCommitted("post") === true, "commit was not recorded")
    check(mailbox.markToolResponseCommitted("post") === false, "duplicate commit changed state")
    check(mailbox.cancelToolResponse(postTicket) === false, "post-commit cancel claimed refusal")
    check(mailbox.toolResponses[postTicket] === undefined, "abandoned post-commit ticket was retained")
    check(mailbox.toolResponseFor("post") === null, "committed request invented an early outcome")
    var executed = finalResponse("post", "executed")
    check(mailbox.completeToolResponse("post", JSON.stringify(executed)) === true,
          "real post-commit outcome was not retained")
    check(same(mailbox.toolResponseFor("post"), executed), "post-commit outcome changed")

    var authTicket = mailbox.pendingToolResponse("auth")
    var wrongCancel = mailbox.serveCall(JSON.stringify({
      token: "token", channel: "wrong", op: "cancel", ticket: authTicket
    }))
    check(wrongCancel === "", "wrong-channel cancel was answered as authenticated")
    check(mailbox.toolResponses[authTicket] !== undefined, "wrong-channel cancel reached the mailbox")
    var wrongPoll = mailbox.serveCall(JSON.stringify({
      token: "token", channel: "wrong", op: "poll", ticket: authTicket
    }))
    check(wrongPoll === "", "wrong-channel poll reached the mailbox")
    check(mailbox.pollToolResponse(authTicket).nodiPending === authTicket,
          "authenticated poll did not preserve pending response")

    mailbox.resetSession()
    check(Object.keys(mailbox.toolResponses).length === 0, "reset retained transport tickets")
    check(Object.keys(mailbox.toolRequests).length === 0, "reset retained request outcomes")
    test.done(test.failures.length === 0, test.failures.join("; "))
  }
}
