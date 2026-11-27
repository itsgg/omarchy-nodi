// The run tool's response mailbox (lib/AskMailbox.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const M = load("lib/AskMailbox.js");

const box = (over = {}) => ({
  requests: {}, responses: {}, retired: {}, requestCount: 0, responseCount: 0,
  retiredCount: 0, nextTicket: 0, token: "tok", channel: "chan",
  ticketLimit: 2048, requestLimit: 1024, retiredLimit: 2048, ...over
});

test("a request opens one record and a ticket per delivery", () => {
  const b = box();
  const first = M.pending(b, 1);
  assert.deepEqual(plain(first), { value: "tok:1", changed: { requests: true, responses: true } });
  const again = M.pending(b, 1);
  assert.deepEqual(plain(again), { value: "tok:2", changed: { responses: true } });
  assert.deepEqual(plain(b.requests), { "number:1": { id: 1, state: "pending", response: "" } });
  assert.deepEqual([b.requestCount, b.responseCount, b.nextTicket], [1, 2, 2]);
  assert.equal(M.pending(b, "1").value, "tok:3", "a string ID is another request");
  assert.equal(b.requestCount, 2);
});

test("a full mailbox opens nothing and names its limit", () => {
  const tickets = box({ responseCount: 2000, retiredCount: 48 });
  assert.deepEqual(plain(M.pending(tickets, 1)), { value: "", changed: {}, capacity: "mailbox tickets" });
  const records = box({ requestCount: 1024 });
  assert.deepEqual(plain(M.pending(records, 1)), { value: "", changed: {}, capacity: "action request records" });
  assert.deepEqual(plain(records.requests), {});
  records.requests["number:1"] = { id: 1, state: "pending", response: "" };
  assert.equal(M.pending(records, 1).value, "tok:1", "a known request still gets a ticket");
});

test("a response is terminal once, and committed is never refused", () => {
  const b = box();
  M.pending(b, 1);
  assert.equal(M.commit(b, 1).value, true);
  assert.equal(M.commit(b, 1).value, false);
  assert.equal(M.responseFor(b, 1), null);
  assert.equal(M.complete(b, 1, JSON.stringify({ id: 1, ok: true })).value, true);
  assert.equal(M.complete(b, 1, "{}").value, false);
  assert.deepEqual(plain(M.responseFor(b, 1)), { id: 1, ok: true });
  assert.equal(M.commit(b, 2).value, false);
  b.requests["number:3"] = { id: 3, state: "ready", response: "{" };
  assert.equal(M.responseFor(b, 3).error.message, "Ask produced an invalid action response");
});

test("a poll waits until the response is ready, then spends its ticket", () => {
  const b = box();
  const ticket = M.pending(b, 1).value;
  assert.deepEqual(plain(M.poll(b, ticket).value), { nodiPending: ticket });
  M.complete(b, 1, JSON.stringify({ id: 1 }));
  assert.deepEqual(plain(M.poll(b, ticket)), { value: { id: 1 }, changed: { responses: true } });
  assert.equal(b.responseCount, 0);
  assert.equal(M.poll(b, ticket).value.error.message, "This action response is no longer available");
});

test("a cancelled ticket refuses a pending request, or withdraws the card it shows", () => {
  const b = box();
  const t1 = M.pending(b, 1).value;
  assert.deepEqual(plain(M.cancel(b, t1)), { value: true, changed: { responses: true, requests: true } });
  assert.deepEqual(JSON.parse(JSON.parse(b.requests["number:1"].response).result.content[0].text), { status: "refused" });
  assert.deepEqual(plain(M.cancel(b, t1)), { value: false, changed: {} });
  const t2 = M.pending(b, 2).value;
  const shown = M.cancel(b, t2, "number:2");
  assert.equal(shown.cancelAction, true);
  assert.equal(b.requests["number:2"].state, "pending", "the card's withdrawal publishes the refusal");
  const t3 = M.pending(b, 3).value;
  M.commit(b, 3);
  assert.deepEqual(plain(M.cancel(b, t3)), { value: false, changed: { responses: true } });
  assert.equal(b.requests["number:3"].state, "committed");
});

test("a dead session's ready tickets are retired for their own token and channel", () => {
  const b = box();
  const ready = M.pending(b, 1).value;
  M.pending(b, 2);
  M.complete(b, 1, "R");
  assert.deepEqual(plain(M.retire(b)), { changed: { responses: true, retired: true } });
  assert.deepEqual(plain(b.retired), { [ready]: { token: "tok", channel: "chan", response: "R" } });
  assert.deepEqual(plain(b.responses), {});
  assert.deepEqual([b.responseCount, b.retiredCount], [0, 1]);
  assert.deepEqual(plain(M.retire(box({ token: "" }))), { changed: {} });
});

test("retiring past the limit stops where it is and names the limit", () => {
  const b = box({ retiredLimit: 1 });
  M.pending(b, 1); M.pending(b, 2);
  M.complete(b, 1, "A"); M.complete(b, 2, "B");
  const r = M.retire(b);
  assert.equal(r.capacity, "retired action responses");
  assert.equal(b.retiredCount, 1);
  assert.equal(Object.keys(b.responses).length, 1);
  assert.equal(b.responseCount, 2, "the count is left for the session's end");
});

test("the session's end answers every open request, unknown once committed", () => {
  const b = box();
  M.pending(b, 1); M.pending(b, 2); M.pending(b, 3);
  M.commit(b, 2);
  M.complete(b, 3, "kept");
  M.endAll(b, "limit");
  const said = id => JSON.parse(JSON.parse(b.requests["number:" + id].response).result.content[0].text).status;
  assert.equal(said(1), "error");
  assert.equal(said(2), "unknown");
  assert.equal(b.requests["number:3"].response, "kept");
  assert.equal(JSON.parse(b.requests["number:1"].response).result.isError, true);
});
