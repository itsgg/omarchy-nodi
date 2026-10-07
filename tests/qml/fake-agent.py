#!/usr/bin/python3
# A stand-in ACP agent for components/Ask.qml (tests/qml/AskActsTest.qml):
# it plays the agent's side as claude-agent-acp 0.86.0 does, starts the
# bar's tool server it is given (bin/nodi mcp --ask, which reaches the
# test's own Quickshell instance through a stand-in omarchy-shell), and
# answers "ok" only if every reply was what it should be. The question picks what it plays:
#   lock my screen             tools/list and a search through the bar,
#                              another tool asked about and refused, a
#                              made-up key refused unshown, two runs at
#                              once, one he allows and runs once, a run
#                              called unasked shown in the bar, one refused
#   exit while proposing       asks for a run, then exits
#   recycle while proposing    asks for a run, then waits
#   the bar closes in the run  a run he allows closes the bar; the next is
#                              refused, the bar closed
#   say ok                     answers at once, once a session
#   use the shouter            a named server's tool, which he allows
#   What is in the picture?    the picture first, as a block
#   while the bar is closed    asks for a run, which must be refused
#   Fix the spelling and ...   the text must come with it, each time
#   plain question             an agent with no _meta: the instructions
#                              come with the first prompt only, and a
#                              picture it does not take does not come
#   sign in first              session/new needs a sign-in, which he gives
# argv[1] names the session's agent ("claude", with _meta; "plain"
# without); argv[2], "auth", makes session/new ask for a sign-in, and
# "authhang" one that never finishes.
import json, os, subprocess, sys

KIND = sys.argv[1] if len(sys.argv) > 1 else "claude"
AUTH = len(sys.argv) > 2 and sys.argv[2] in ("auth", "authhang")
HANG = len(sys.argv) > 2 and sys.argv[2] == "authhang"

def send(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()

def read():
    line = sys.stdin.readline()
    return json.loads(line) if line else None

bad = []
def want(cond, what):
    if not cond: bad.append(what)

# A request to Nodi, and its answer, whatever comes between.
seq = [0]
def ask_nodi(method, params):
    seq[0] += 1
    rid = "q-%d" % seq[0]
    send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    while True:
        m = read()
        if m is None: sys.exit(0)
        if m.get("id") == rid and "method" not in m: return m

def answer(text, sid):
    send({"jsonrpc": "2.0", "method": "session/update", "params": {"sessionId": sid, "update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": text}}}})

OPTIONS = [{"optionId": "allow-once", "name": "Yes", "kind": "allow_once"},
           {"optionId": "allow-with-updates", "name": "Yes, and don't ask again", "kind": "allow_always"},
           {"optionId": "reject", "name": "No", "kind": "reject_once"}]

calls = [0]
def tool(sid, name, inp, server="nodi"):
    calls[0] += 1
    tid = "toolu_%d" % calls[0]
    meta = {"claudeCode": {"toolName": name, "mcpServer": {"name": server, "source": "dynamic"}}}
    send({"jsonrpc": "2.0", "method": "session/update", "params": {"sessionId": sid, "update": {"sessionUpdate": "tool_call", "toolCallId": tid, "title": name, "kind": "other", "status": "pending", "rawInput": {}, "_meta": meta}}})
    return {"toolCallId": tid, "title": name, "rawInput": inp, "_meta": meta}

def permission(sid, name, inp, server="nodi"):
    r = ask_nodi("session/request_permission", {"sessionId": sid, "toolCall": tool(sid, name, inp, server), "options": OPTIONS})
    o = (r.get("result") or {}).get("outcome") or {}
    return o.get("optionId") if o.get("outcome") == "selected" else o.get("outcome")

def permission_both(sid, a, b):
    # Two at once: both sent before either answer is read.
    ids = []
    for n, inp in (a, b):
        seq[0] += 1
        rid = "q-%d" % seq[0]; ids.append(rid)
        send({"jsonrpc": "2.0", "id": rid, "method": "session/request_permission", "params": {"sessionId": sid, "toolCall": tool(sid, n, inp), "options": OPTIONS}})
    got = {}
    while len(got) < 2:
        m = read()
        if m is None: sys.exit(0)
        if m.get("id") in ids: got[m["id"]] = m["result"]["outcome"]
    return [(got[i].get("optionId") or got[i].get("outcome")) for i in ids], ids

TOKEN = [""]
SERVER = [None]
# The bar's tool server, started as an agent starts one: its command, its
# arguments, and its env over the agent's own; MCP over its stdin and stdout.
def mcp(method, params, mid):
    if SERVER[0] is None:
        env = dict(os.environ); env.update({e["name"]: e["value"] for e in nodi["env"]})
        SERVER[0] = subprocess.Popen([nodi["command"]] + nodi["args"], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        talk("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "fake", "version": "1"}}, 0)
        SERVER[0].stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n"); SERVER[0].stdin.flush()
    return talk(method, params, mid)

def talk(method, params, mid):
    SERVER[0].stdin.write(json.dumps({"jsonrpc": "2.0", "id": mid, "method": method, "params": params}) + "\n"); SERVER[0].stdin.flush()
    out = SERVER[0].stdout.readline().strip()
    try: return json.loads(out)
    except Exception: return {"raw": out}

def said(r):
    return r["result"]["content"][0]["text"] if "result" in r else json.dumps(r)

LOCK = {"key": "menu:system.lock"}

# The handshake: what Nodi offers, and what this agent does.
m = read()
want(m and m.get("method") == "initialize" and m["params"].get("protocolVersion") == 1, "initialize first: %r" % (m,))
caps = m["params"].get("clientCapabilities", {}) if m else {}
want(caps.get("fs") == {"readTextFile": False, "writeTextFile": False} and caps.get("terminal") is False, "no files, no terminal: %r" % (caps,))
send({"jsonrpc": "2.0", "id": m["id"], "result": {"protocolVersion": 1, "agentInfo": {"name": "fake", "title": "Fake Agent", "version": "1"},
      "agentCapabilities": {"promptCapabilities": {"image": KIND == "claude"}, "mcpCapabilities": {"http": True}},
      "authMethods": [{"id": "login", "name": "Log in", "description": "Opens a page"}] if AUTH else []}})

m = read()
if AUTH:
    want(m and m.get("method") == "session/new", "session/new: %r" % (m,))
    send({"jsonrpc": "2.0", "id": m["id"], "error": {"code": -32000, "message": "Authentication required"}})
    m = read()
    want(m and m.get("method") == "authenticate" and m["params"] == {"methodId": "login"}, "authenticate by the method offered: %r" % (m,))
    if HANG:
        # A sign-in that never finishes: only the bar's guard ends it.
        for _ in sys.stdin: pass
        sys.exit(0)
    send({"jsonrpc": "2.0", "id": m["id"], "result": {}})
    m = read()
want(m and m.get("method") == "session/new", "then session/new: %r" % (m,))
p = m["params"]
servers = {s["name"]: s for s in p.get("mcpServers", [])}
nodi = servers.get("nodi")
want(nodi and nodi["args"] == ["mcp", "--ask"] and nodi["command"].endswith("/bin/nodi"), "the bar's server: %r" % (nodi,))
env = {e["name"]: e["value"] for e in (nodi or {}).get("env", [])}
TOKEN[0] = env.get("NODI_ASK_SESSION", "")
want(len(TOKEN[0]) >= 16, "a session token: %r" % (env,))
meta = p.get("_meta")
if KIND == "claude":
    want(meta and "desktop command bar" in meta.get("systemPrompt", "") and meta["claudeCode"]["options"]["tools"] == [], "Claude's options: %r" % (meta,))
else:
    want(meta is None, "no _meta for a plain agent: %r" % (meta,))
send({"jsonrpc": "2.0", "id": m["id"], "result": {"sessionId": "s1"}})
SID = "s1"

prompts = 0
while True:
    m = read()
    if m is None: sys.exit(0)
    if m.get("method") != "session/prompt": continue
    prompts += 1
    pid = m["id"]
    blocks = m["params"]["prompt"]
    texts = [b["text"] for b in blocks if b.get("type") == "text"]
    question = texts[-1] if texts else ""
    bad = []

    def end(text=None):
        answer(text if text is not None else ("ok" if not bad else "fail: " + "; ".join(bad)), SID)
        send({"jsonrpc": "2.0", "id": pid, "result": {"stopReason": "end_turn"}})

    if question == "exit while proposing":
        tool(SID, "mcp__nodi__run", LOCK)
        send({"jsonrpc": "2.0", "id": "p-exit", "method": "session/request_permission",
              "params": {"sessionId": SID, "toolCall": tool(SID, "mcp__nodi__run", LOCK), "options": OPTIONS}})
        sys.exit(3)

    if question == "recycle while proposing":
        send({"jsonrpc": "2.0", "id": "p-wait", "method": "session/request_permission",
              "params": {"sessionId": SID, "toolCall": tool(SID, "mcp__nodi__run", LOCK), "options": OPTIONS}})
        for _ in sys.stdin: pass
        sys.exit(0)

    if question == "the bar closes in the run":
        want(permission(SID, "mcp__nodi__run", LOCK) == "allow-once", "the first run allowed")
        want(said(mcp("tools/call", {"name": "run", "arguments": LOCK}, 1)).startswith("Ran: Lock"), "and run")
        want(permission(SID, "mcp__nodi__run", LOCK) == "reject", "the next refused, the bar closed")
        end(); continue

    if question.startswith("Fix the spelling and grammar of the text below"):
        want("\n<text>\nteh\n</text>" in question, "the selection sent with the question: %r" % (question,))
        end(); continue

    if question == "What is in the picture?":
        want(blocks[0] == {"type": "image", "mimeType": "image/jpeg", "data": "AAAA"} and blocks[1]["type"] == "text", "the picture first: %r" % (blocks,))
        end(); continue

    if question == "while the bar is closed":
        want(permission(SID, "mcp__nodi__run", LOCK) == "reject", "refused while closed")
        end(); continue

    if question == "use the shouter":
        want(servers.get("shouter") == {"name": "shouter", "command": "shout", "args": [], "env": []}, "the named server given: %r" % (servers,))
        want(permission(SID, "mcp__shouter__shout", {"text": "hi"}, "shouter") == "allow-once", "a named server's call allowed by him")
        end(); continue

    if question == "say ok":
        end("ok" if prompts == 1 else "fail: the same session answered twice"); continue

    if question.startswith("plain question"):
        if prompts == 1:
            want(len(texts) == 2 and "desktop command bar" in texts[0], "the instructions first, the first time: %r" % (texts,))
        else:
            want(len(texts) == 1, "the instructions once only: %r" % (texts,))
        want(not any(b.get("type") == "image" for b in blocks), "no picture to an agent that takes none")
        want(prompts > 1 or "takes none" in question, "the picture said not to have gone: %r" % (question,))
        end(); continue

    if question == "sign in first":
        end(); continue

    # lock my screen
    tl = mcp("tools/list", {}, 1)
    want([t["name"] for t in tl.get("result", {}).get("tools", [])] == ["search", "run"], "the bar's two tools: %r" % (tl,))
    want(permission(SID, "mcp__nodi__search", {"query": "lock"}) == "allow-once", "a search allowed at once")
    rows = json.loads(said(mcp("tools/call", {"name": "search", "arguments": {"query": "lock"}}, 2)))
    want(rows and rows[0]["key"] == "menu:system.lock", "search answered: %r" % (rows,))
    want(permission(SID, "Bash", {"command": "rm -rf ~"}, "none") == "reject", "another tool shown, and refused by him")
    want(permission(SID, "mcp__nodi__run", {"key": "made:up"}) == "reject", "a key the bar cannot run refused unshown")
    (first, second), _ = permission_both(SID, ("mcp__nodi__run", LOCK), ("mcp__nodi__run", LOCK))
    want(second == "reject", "the second run refused while the first waits: %r" % (second,))
    want(first == "allow-once", "the first allowed by him: %r" % (first,))
    want(said(mcp("tools/call", {"name": "run", "arguments": LOCK}, 3)) == "Ran: Lock", "the allowed run done")
    shown = said(mcp("tools/call", {"name": "run", "arguments": LOCK}, 4))
    want(shown.startswith("Shown to him in the bar"), "a run called unasked is shown, not run: %r" % (shown,))
    want(said(mcp("tools/call", {"name": "run", "arguments": LOCK}, 5)).startswith("Not run: One run at a time"), "one shown at a time")
    want(permission(SID, "mcp__nodi__run", LOCK) == "reject", "refused while one is shown")
    end()
