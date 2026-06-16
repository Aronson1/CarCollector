import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDealPushThresholds } from "../lib/settings-utils.ts";

test("normalizes deal push thresholds per purchase option", () => {
  assert.deepEqual(
    normalizeDealPushThresholds(
      {
        release: 70,
        sale: 40,
        newRelease: 101,
      },
      60,
    ),
    {
      release: 70,
      sale: 40,
      newRelease: 100,
    },
  );
});

test("falls back to the legacy deal push threshold", () => {
  assert.deepEqual(normalizeDealPushThresholds({}, 55), {
    release: 55,
    sale: 55,
    newRelease: 55,
  });
});
