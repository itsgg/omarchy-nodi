#!/usr/bin/python3
# A stand-in for `claude -p` with the bar's tools (tests/qml/AskActsTest.qml):
# it plays the Agent SDK's control channel as Claude Code 2.1.289 does, and
# answers "ok" only if every reply from the bar was what it should be. The
# question picks what it plays:
#   lock my screen             search, a refused tool, a made-up key, a run
#                              called unasked, two runs at once, a run he
#                              allows and one he refuses
#   exit while proposing       asks for a run, then exits
#   recycle while proposing    asks for a run, then waits
#   recycle in the run         asks for a run, then calls it: the bar's run
#                              ends the session, as an allowed run closes it
#   say ok                     answers at once
import json, sys

def send(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()

def read():
    line = sys.stdin.readline()
    return json.loads(line) if line else None

bad = []
def want(cond, what):
    if not cond: bad.append(what)

def answer(text):
    send({"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": text}}})
    send({"type": "result", "subtype": "success", "is_error": False, "result": text})

m = read()
want(m and m.get("type") == "control_request" and m["request"].get("subtype") == "initialize"
     and m["request"].get("sdkMcpServers") == ["nodi"], "initialize first: %r" % (m,))
send({"type": "control_response", "response": {"subtype": "success", "request_id": m["request_id"]}})
u = read()
want(u and u.get("type") == "user", "then the question: %r" % (u,))
question = u["message"]["content"] if u else ""
send({"type": "system", "subtype": "init"})

def request(rid, tool, inp):
    send({"type": "control_request", "request_id": rid, "request": {"subtype": "can_use_tool", "tool_name": tool, "input": inp}})

def ask(rid, tool, inp):
    request(rid, tool, inp)
    return read()

def call(rid, mid, name, args):
    send({"type": "control_request", "request_id": rid, "request": {"subtype": "mcp_message", "server_name": "nodi",
          "message": {"jsonrpc": "2.0", "id": mid, "method": "tools/call", "params": {"name": name, "arguments": args}}}})
    return read()

def said(r):
    return r["response"]["response"]["mcp_response"]["result"]["content"][0]["text"]

def behavior(r):
    return r["response"]["request_id"], r["response"]["response"]["behavior"]

LOCK = {"key": "menu:system.lock"}

if question == "exit while proposing":
    request("p1", "mcp__nodi__run", LOCK)
    sys.exit(3)

# These two wait to be stopped, as Claude Code would: only the recycle's
# signal ends them, so a recycle that never sends it fails the test (Fable
# 2026-10-06).
if question == "recycle in the run":
    r = ask("p1", "mcp__nodi__run", LOCK)
    call("c1", 1, "run", LOCK)
    for _ in sys.stdin: pass
    sys.exit(0)

if question == "recycle while proposing":
    request("p1", "mcp__nodi__run", LOCK)
    r = read()
    for _ in sys.stdin: pass
    sys.exit(0)

if question == "say ok":
    answer("ok")
    sys.stdin.readline()
    sys.exit(0)

r = ask("p1", "mcp__nodi__search", {"query": "lock"})
want(behavior(r) == ("p1", "allow"), "search allowed at once: %r" % (r,))
rows = json.loads(said(call("c1", 7, "search", {"query": "lock"})))
want(rows and rows[0]["key"] == "menu:system.lock", "search answered: %r" % (rows,))
r = ask("p2", "Bash", {"command": "rm -rf ~"})
want(behavior(r) == ("p2", "deny"), "any other tool refused: %r" % (r,))
r = ask("p5", "mcp__nodi__run", {"key": "made:up"})
want(behavior(r) == ("p5", "deny"), "a key the bar cannot run refused at once, never shown: %r" % (r,))
want(said(call("c0", 6, "run", LOCK)).startswith("Not run"), "a run he never allowed does not run")
# Two runs at once: the second is refused while the first waits for him.
request("p3", "mcp__nodi__run", LOCK)
request("p4", "mcp__nodi__run", LOCK)
first, second = read(), read()
want(behavior(first) == ("p4", "deny"), "the second run refused at once: %r" % (first,))
want(behavior(second) == ("p3", "allow"), "the first allowed by him: %r" % (second,))
want(said(call("c2", 8, "run", LOCK)) == "Ran: Lock", "the allowed run done")
want(said(call("c3", 9, "run", LOCK)).startswith("Not run"), "an allowed run runs once")
r = ask("p6", "mcp__nodi__run", LOCK)
want(behavior(r) == ("p6", "deny") and "refused" in r["response"]["response"]["message"], "the next one he refused: %r" % (r,))
answer("ok" if not bad else "fail: " + "; ".join(bad))
sys.stdin.readline()
