#!/usr/bin/python
import json
import sys


def send(value):
    sys.stdout.write(json.dumps(value, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def read():
    line = sys.stdin.readline()
    return json.loads(line) if line else None


sessions = 0
current = ""
opened = False
while True:
    message = read()
    if message is None:
        break
    method = message.get("method")
    mid = message.get("id")
    params = message.get("params", {})
    if method == "initialize":
        send({
            "jsonrpc": "2.0", "id": mid,
            "result": {
                "protocolVersion": 1,
                "agentInfo": {"name": "interaction-test", "title": "Interaction Test"},
                "agentCapabilities": {
                    "promptCapabilities": {},
                    "sessionCapabilities": {"list": {}, "resume": {}, "close": {}},
                },
            },
        })
    elif method == "session/list":
        send({
            "jsonrpc": "2.0", "id": mid,
            "result": {"sessions": [{"sessionId": "saved-1", "title": "Saved", "cwd": "/tmp"}]},
        })
    elif method == "session/new":
        sessions += 1
        current = "session-" + str(sessions)
        send({"jsonrpc": "2.0", "id": mid, "result": {"sessionId": current}})
    elif method == "session/resume":
        current = params.get("sessionId", "")
        send({"jsonrpc": "2.0", "id": mid, "result": {}})
    elif method == "session/close":
        send({"jsonrpc": "2.0", "id": mid, "result": {}})
    elif method == "_nodi/opened_link":
        opened = params.get("url") == "https://example.test" and params.get("success") is True
    elif method == "session/prompt":
        text = params.get("prompt", [{}])[-1].get("text", "")
        if text == "interactions":
            send({
                "jsonrpc": "2.0", "method": "session/update",
                "params": {
                    "sessionId": current,
                    "update": {
                        "sessionUpdate": "available_commands_update",
                        "availableCommands": [
                            {"name": "status", "description": "Show status"},
                            {"name": "review", "description": "Review", "input": {"hint": "scope", "required": True}},
                        ],
                    },
                },
            })
            send({
                "jsonrpc": "2.0", "method": "session/update",
                "params": {
                    "sessionId": current,
                    "update": {
                        "sessionUpdate": "plan",
                        "entries": [{"content": "Inspect", "status": "in_progress", "priority": "high"}],
                    },
                },
            })
            send({
                "jsonrpc": "2.0", "id": "form-1", "method": "elicitation/create",
                "params": {
                    "sessionId": current, "mode": "form", "message": "Choose",
                    "requestedSchema": {
                        "type": "object", "required": ["strategy"],
                        "properties": {
                            "strategy": {"type": "string", "enum": ["safe", "fast"], "default": "safe"}
                        },
                    },
                },
            })
            form = read()
            accepted = form and form.get("id") == "form-1" and form.get("result", {}).get("action") == "accept"
            word = "done" if accepted else "form failed"
            send({
                "jsonrpc": "2.0", "method": "session/update",
                "params": {"sessionId": current, "update": {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {"type": "text", "text": word},
                }},
            })
            send({
                "jsonrpc": "2.0", "id": mid,
                "result": {
                    "stopReason": "end_turn",
                    "_meta": {"nodi": {"actions": [
                        {"title": "Continue", "action": {"prompt": "/status"}},
                        {"title": "Open", "action": {"open": "https://example.test"}},
                        {"title": "Run", "action": {"exec": ["true"]}},
                    ]}},
                },
            })
        else:
            answer = ("opened=yes" if opened else "opened=no") if text == "linkcheck" else text
            send({
                "jsonrpc": "2.0", "method": "session/update",
                "params": {"sessionId": current, "update": {
                    "sessionUpdate": "agent_message_chunk",
                    "content": {"type": "text", "text": answer + "@" + current},
                }},
            })
            send({"jsonrpc": "2.0", "id": mid, "result": {"stopReason": "end_turn"}})
