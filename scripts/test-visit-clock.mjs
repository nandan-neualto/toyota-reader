import test from "node:test";
import assert from "node:assert/strict";
import { visitClock } from "../lib/visit-clock.ts";

test("a visit warns after four minutes and expires after the full grace period", () => {
  const start = 100000;
  assert.deepEqual(visitClock(start, start + 239999, false), { remaining: 31, warning: false, expired: false });
  assert.deepEqual(visitClock(start, start + 240000, false), { remaining: 30, warning: true, expired: false });
  assert.deepEqual(visitClock(start, start + 269999, false), { remaining: 1, warning: true, expired: false });
  assert.deepEqual(visitClock(start, start + 270000, false), { remaining: 0, warning: false, expired: true });
});
test("active narration cannot expire; fresh activity grants a full new period", () => {
  assert.deepEqual(visitClock(0, 600000, true), { remaining: 0, warning: false, expired: false });
  assert.deepEqual(visitClock(600000, 600000, false), { remaining: 270, warning: false, expired: false });
  assert.equal(visitClock(600000, 839000, false).warning, false);
  assert.equal(visitClock(600000, 840000, false).warning, true);
});
test("a backwards device clock does not shorten a visit", () => {
  assert.equal(visitClock(10000, 0, false).remaining, 270);
});
