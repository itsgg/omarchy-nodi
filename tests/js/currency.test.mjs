// providers/currency.js: amounts as shown.

import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./fixtures.mjs";

const conv = q => run(q).filter(r => r.provider === "currency")[0];

test("currency: the amount converted is rounded as its result is", () => {
  const third = conv("1/3 usd to eur");
  assert.equal(third.title, "0.3 EUR");
  assert.match(third.subtitle, /^0\.3333 USD to EUR/);
  assert.match(conv("1234.5678 usd to eur").subtitle, /^1,234\.57 USD to EUR/);
  assert.match(conv("100 usd to lkr").subtitle, /^100 USD to LKR/);
});
