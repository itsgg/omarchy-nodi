#!/usr/bin/python
"""Generic JSONL Unix-socket fixture for Nodi's transport tests."""

import asyncio
import json
import os
import signal
import sys

path = sys.argv[1]
cancelled = set()
writers = set()


async def send(writer, value):
    writer.write((json.dumps(value, separators=(",", ":")) + "\n").encode())
    await writer.drain()


async def answer(writer, message):
    request_id = message["id"]
    query = message.get("q", "")
    if query == "stream":
        await send(writer, {"id": request_id, "row": {"id": "one", "title": "One"}})
        await asyncio.sleep(0.08)
        await send(writer, {"id": request_id, "row": {"id": "two", "title": "Two"}})
    elif query == "slow":
        await asyncio.sleep(0.25)
        # Deliberately answer even after cancellation. The client must reject
        # stale IDs instead of trusting the daemon to cooperate.
        await send(writer, {"id": request_id, "row": {"title": "Stale"}})
    elif query == "malformed":
        writer.write(b"not-json\n")
        await send(writer, {"id": "stale-id", "row": {"title": "Wrong ID"}})
        await send(writer, {"id": request_id, "row": {"title": "Valid"}})
    elif query == "overflow":
        writer.write((json.dumps({"id": request_id, "row": {"title": "x" * 4096}}) + "\n").encode())
        await writer.drain()
        return
    elif query == "exit":
        writer.close()
        return
    else:
        await send(writer, {"id": request_id, "row": {"title": query or "Empty"}})
    await send(writer, {"id": request_id, "done": True})


async def client(reader, writer):
    writers.add(writer)
    tasks = set()
    try:
        while line := await reader.readline():
            try:
                message = json.loads(line)
            except Exception:
                continue
            if "cancel" in message:
                cancelled.add(message["cancel"])
                continue
            if message.get("version") != 1 or not isinstance(message.get("id"), str):
                continue
            task = asyncio.create_task(answer(writer, message))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
    finally:
        for task in tasks:
            task.cancel()
        writers.discard(writer)
        writer.close()


async def main():
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
    server = await asyncio.start_unix_server(client, path)
    os.chmod(path, 0o600)
    print("READY", flush=True)
    async with server:
        await server.serve_forever()


signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
asyncio.run(main())
