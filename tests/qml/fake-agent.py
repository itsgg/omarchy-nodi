#!/usr/bin/python3
# A stand-in ACP agent for components/Ask.qml (tests/qml/AskActsTest.qml):
# it plays the agent's side as claude-agent-acp 0.86.0 does, starts the
# bar's tool server it is given (bin/nodi mcp --ask, which reaches the
# test's own Quickshell instance through a stand-in omarchy-shell), and
# answers "ok" only if every reply was what it should be. The question picks what it plays:
#   lock my screen             tools/list, then one direct run({query}),
#                              with request-ID-only replay after Enter
#   search then run            invalid and unresolved direct calls, then
#                              search followed by run({key})
#   old turn replay            a failed request ID repeated on the next turn
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
#   say a lot                  streams 100-byte chunks until it is told
#                              session/cancel (at most 200), then ends the
#                              turn cancelled, as an agent does
# argv[1] names the session's agent ("claude", with _meta; "plain"
# without); argv[2], "auth", makes session/new ask for a sign-in,
# "authhang" one that never finishes, and "installing" says on stderr that
# an adapter is installing, as the launch script does.
import json, os, subprocess, sys, time

KIND = sys.argv[1] if len(sys.argv) > 1 else "claude"
MODE = sys.argv[2] if len(sys.argv) > 2 else ""
AUTH = MODE in ("auth", "authhang")
HANG = MODE == "authhang"
# As Nodi's launch script says when it installs an adapter (lib/Agents.js).
if MODE == "installing":
    sys.stderr.write("nodi: installing fake@1\n"); sys.stderr.flush()
    # An install takes its time before the adapter answers: longer than the
    # test's start limit, so a start guard that kept counting from the
    # process's start would fail it (AskActsTest.qml installed).
    import time; time.sleep(3)

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
def tool(sid, name, inp, server=None, meta=None, call_id=None, omit_call_id=False):
    calls[0] += 1
    tid = call_id if call_id is not None else "toolu_%d" % calls[0]
    server = server or ACTION_SERVER[0]
    if name.startswith("mcp__nodi__"):
        name = "mcp__%s__%s" % (server, name[len("mcp__nodi__"):])
    if meta is None:
        meta = {"claudeCode": {"toolName": name, "mcpServer": {"name": server, "source": "dynamic"}}}
    update = {"sessionUpdate": "tool_call", "title": name, "kind": "other", "status": "pending", "rawInput": {}, "_meta": meta}
    call = {"title": name, "rawInput": inp, "_meta": meta}
    if not omit_call_id:
        update["toolCallId"] = tid
        call["toolCallId"] = tid
    send({"jsonrpc": "2.0", "method": "session/update", "params": {"sessionId": sid, "update": update}})
    return call

def permission(sid, name, inp, server=None, meta=None, call_id=None, omit_call_id=False):
    r = ask_nodi("session/request_permission", {"sessionId": sid, "toolCall": tool(sid, name, inp, server, meta, call_id, omit_call_id), "options": OPTIONS})
    o = (r.get("result") or {}).get("outcome") or {}
    return o.get("optionId") if o.get("outcome") == "selected" else o.get("outcome")

def tool_update(sid, tid, status):
    send({"jsonrpc": "2.0", "method": "session/update", "params": {"sessionId": sid, "update": {
        "sessionUpdate": "tool_call_update", "toolCallId": tid, "status": status
    }}})

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
ACTION_SERVER = [""]
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
DIRECT = {"query": "lock"}

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
if MODE == "installing":
    time.sleep(2)
p = m["params"]
servers = {s["name"]: s for s in p.get("mcpServers", [])}
nodi_names = [name for name in servers if name.startswith("nodi-")]
nodi = servers.get(nodi_names[0]) if len(nodi_names) == 1 else None
ACTION_SERVER[0] = nodi_names[0] if len(nodi_names) == 1 else ""
want(nodi and nodi["args"] == ["mcp", "--ask"] and nodi["command"].endswith("/bin/nodi"), "the bar's server: %r" % (nodi,))
env = {e["name"]: e["value"] for e in (nodi or {}).get("env", [])}
TOKEN[0] = env.get("NODI_ASK_SESSION", "")
want(len(TOKEN[0]) >= 16, "a session token: %r" % (env,))
want(ACTION_SERVER[0] == "nodi-" + env.get("NODI_ASK_CHANNEL", ""), "the action server is bound to its channel: %r / %r" % (ACTION_SERVER[0], env))
meta = p.get("_meta")
if KIND == "claude":
    want(meta and "desktop command bar" in meta.get("systemPrompt", "") and meta["claudeCode"]["options"]["tools"] == []
         and meta["claudeCode"]["options"]["allowedTools"] == ["mcp__%s__search" % ACTION_SERVER[0]],
         "Claude's options: %r" % (meta,))
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

    if question == "wait before words":
        time.sleep(1)
        end()
        continue

    if question == "identity and activity":
        want(permission(SID, "mcp__nodi__search", {"query": "lock"}) == "allow-once",
             "the exact dynamic search permission was not forwarded")
        exact_title = "mcp__%s__run" % ACTION_SERVER[0]
        want(permission(SID, exact_title, DIRECT, ACTION_SERVER[0], {}) == "reject",
             "a title without trusted metadata bypassed ordinary permission")
        want(permission(SID, exact_title, DIRECT, "nodi") == "reject",
             "a same-named tool from another server bypassed ordinary permission")
        want(permission(SID, exact_title, DIRECT, omit_call_id=True) == "reject",
             "trusted metadata without a tool call ID bypassed ordinary permission")
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="identity-wrong-id") == "allow-once",
             "the call-ID mismatch fixture was not permission-bound")
        forged = mcp("tools/call", {"name": "run", "arguments": DIRECT}, "identity-forged")
        want(forged.get("result", {}).get("isError") is True
             and "permission-bound" in said(forged),
             "a different MCP call ID used another operation's permission: %r" % (forged,))
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="identity-wrong-input") == "allow-once",
             "the input mismatch fixture was not permission-bound")
        changed = mcp("tools/call", {"name": "run", "arguments": {"query": "logout"}}, "identity-wrong-input")
        want(changed.get("result", {}).get("isError") is True
             and "permission-bound" in said(changed),
             "changed MCP input used the permission for another input: %r" % (changed,))
        old = tool(SID, "Read old", {}, "other")
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="identity-run") == "allow-once",
             "the exact dynamic run permission was not forwarded")
        outcome = json.loads(said(mcp("tools/call", {"name": "run", "arguments": DIRECT}, "identity-run")))
        want(outcome.get("status") == "executed", "the exact run did not use Nodi's action card: %r" % (outcome,))
        newer = tool(SID, "Read current", {}, "other")
        time.sleep(0.2)
        tool_update(SID, old["toolCallId"], "completed")
        answer("activity-check" if not bad else "fail: " + "; ".join(bad), SID)
        tool_update(SID, newer["toolCallId"], "completed")
        send({"jsonrpc": "2.0", "id": pid, "result": {"stopReason": "end_turn"}})
        continue

    if question == "exit while proposing":
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="exit-run") == "allow-once", "the doomed run permission forwarded")
        answer("bound-exit", SID)
        time.sleep(1)
        sys.exit(3)

    if question == "recycle while proposing":
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="recycle-run") == "allow-once", "the recycled run permission forwarded")
        mcp("tools/list", {}, 91)
        SERVER[0].stdin.write(json.dumps({"jsonrpc": "2.0", "id": "recycle-run", "method": "tools/call",
                                          "params": {"name": "run", "arguments": DIRECT}}) + "\n")
        SERVER[0].stdin.flush()
        for _ in sys.stdin: pass
        sys.exit(0)

    if question == "the bar closes in the run":
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="closing-run") == "allow-once", "the first run permission forwarded")
        outcome = json.loads(said(mcp("tools/call", {"name": "run", "arguments": DIRECT}, "closing-run")))
        want(outcome.get("status") == "executed", "and run: %r" % (outcome,))
        want(permission(SID, "mcp__nodi__run", DIRECT) == "reject", "the next refused, the bar closed")
        end(); continue

    if question == "search then run":
        want(permission(SID, "mcp__nodi__run", {"query": ""}, call_id="empty") == "reject",
             "an invalid run permission was refused")
        empty = mcp("tools/call", {"name": "run", "arguments": {"query": ""}}, "empty")
        want(empty.get("result", {}).get("isError") is True, "an empty query is a tool error: %r" % (empty,))
        empty_replay = mcp("tools/call", {"name": "run", "arguments": {"query": ""}}, "empty")
        want(empty_replay == empty, "an exact invalid request did not replay: %r / %r" % (empty, empty_replay))
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="empty") == "allow-once",
             "the duplicate invalid ID's valid permission forwarded")
        replay = mcp("tools/call", {"name": "run", "arguments": DIRECT}, "empty")
        want(replay.get("result", {}).get("isError") is True
             and "recorded origin" in said(replay)
             and replay != empty,
             "changed input inherited an invalid request's result: %r / %r" % (empty, replay))
        want(permission(SID, "mcp__nodi__run", {"query": "lock", "key": LOCK["key"]}, call_id="both") == "reject",
             "a both-fields permission was refused")
        both = mcp("tools/call", {"name": "run", "arguments": {"query": "lock", "key": LOCK["key"]}}, "both")
        want(both.get("result", {}).get("isError") is True, "both fields are a tool error: %r" % (both,))
        for mid, query in (("missing", "missing"), ("volume", "volume")):
            want(permission(SID, "mcp__nodi__run", {"query": query}, call_id=mid) == "allow-once",
                 "%s permission forwarded" % query)
            failed = mcp("tools/call", {"name": "run", "arguments": {"query": query}}, mid)
            want(failed.get("result", {}).get("isError") is True,
                 "%s is a tool error: %r" % (query, failed))
        want(permission(SID, "mcp__nodi__search", {"query": "lock"}) == "allow-once", "a search allowed at once")
        rows = json.loads(said(mcp("tools/call", {"name": "search", "arguments": {"query": "lock"}}, "search")))
        want(rows and rows[0]["key"] == LOCK["key"], "search answered: %r" % (rows,))
        want(permission(SID, "mcp__nodi__run", LOCK, call_id="searched-run") == "allow-once", "the searched key permission forwarded")
        refused = json.loads(said(mcp("tools/call", {"name": "run", "arguments": LOCK}, "searched-run")))
        want(refused.get("status") == "refused", "Escape refused the searched run: %r" % (refused,))
        end(); continue

    if question == "bar closes before enter":
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="close-run") == "allow-once", "the closing run permission forwarded")
        refused = json.loads(said(mcp("tools/call", {"name": "run", "arguments": DIRECT}, "close-run")))
        want(refused.get("status") == "refused", "close did not refuse the uncommitted run: %r" % (refused,))
        end(); continue

    if question == "close before delivery":
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="closed-delivery") == "allow-once", "the delayed run permission forwarded")
        answer("bound", SID)
        time.sleep(1)
        end(); continue

    if question == "mailbox already terminal":
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="mailbox-race") == "allow-once", "the mailbox-race permission forwarded")
        refused = json.loads(said(mcp("tools/call", {"name": "run", "arguments": DIRECT}, "mailbox-race")))
        want(refused.get("status") == "refused", "the terminal mailbox outcome changed: %r" % (refused,))
        end(); continue

    if question in ("commit fails", "commit throws"):
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id=question) == "allow-once", "the outcome permission forwarded")
        outcome = json.loads(said(mcp("tools/call", {"name": "run", "arguments": DIRECT}, question)))
        expected = "failed" if question == "commit fails" else "unknown"
        want(outcome.get("status") == expected, "%s outcome: %r" % (expected, outcome))
        end(); continue

    if question == "old turn replay":
        want(permission(SID, "mcp__nodi__run", {"query": "missing"}, call_id="old-turn") == "allow-once",
             "old-turn permission forwarded")
        failed = mcp("tools/call", {"name": "run", "arguments": {"query": "missing"}}, "old-turn")
        want(failed.get("result", {}).get("isError") is True, "the old turn failed before proposal")
        end(); continue

    if question == "old turn replay again":
        want(permission(SID, "mcp__nodi__run", {"query": "missing"}, call_id="old-turn") == "allow-once", "delayed permission forwarded")
        stale = mcp("tools/call", {"name": "run", "arguments": {"query": "missing"}}, "old-turn")
        want(stale.get("result", {}).get("isError") is True
             and "No matching row" in said(stale),
             "the delayed old-turn ID did not replay its terminal result: %r" % (stale,))
        end(); continue

    if question == "bind old turn":
        want(permission(SID, "mcp__nodi__run", DIRECT, call_id="unique-old-turn") == "allow-once", "the old turn permission was bound")
        end(); continue

    if question == "deliver old turn":
        stale = mcp("tools/call", {"name": "run", "arguments": DIRECT}, "unique-old-turn")
        want(stale.get("result", {}).get("isError") is True
             and ("turn" in said(stale).lower() or "permission-bound" in said(stale).lower()),
             "a unique delayed old-turn call was accepted as current: %r" % (stale,))
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

    if question == "say a lot":
        cancelled = False
        for i in range(200):
            answer("x" * 100, SID)
            # A cancel Ask sends lands between chunks: read one if it waits.
            import select
            if select.select([sys.stdin], [], [], 0.01)[0]:
                c = read()
                if c and c.get("method") == "session/cancel": cancelled = True; break
        # Never told to stop: the turn fails, so a test sees the cancel missing.
        if cancelled: send({"jsonrpc": "2.0", "id": pid, "result": {"stopReason": "cancelled"}})
        else: send({"jsonrpc": "2.0", "id": pid, "error": {"code": -32603, "message": "never cancelled"}})
        continue

    # lock my screen
    tl = mcp("tools/list", {}, 1)
    want([t["name"] for t in tl.get("result", {}).get("tools", [])] == ["search", "run"], "the bar's two tools: %r" % (tl,))
    want(permission(SID, "mcp__nodi__run", DIRECT, call_id="direct") == "allow-once", "the direct run permission forwarded")
    first = json.loads(said(mcp("tools/call", {"name": "run", "arguments": DIRECT}, "direct")))
    want(first.get("status") == "executed" and first.get("key") == LOCK["key"],
         "the direct run executed: %r" % (first,))
    replay = json.loads(said(mcp("tools/call", {"name": "run", "arguments": DIRECT}, "direct")))
    want(replay == first, "the duplicate request ID did not replay exactly: %r / %r" % (first, replay))
    distinct = mcp("tools/call", {"name": "run", "arguments": DIRECT}, "distinct")
    want(distinct.get("result", {}).get("isError") is True
         and "executed" not in said(distinct), "a distinct request inherited success: %r" % (distinct,))
    end()
