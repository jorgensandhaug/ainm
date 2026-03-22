import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  toText,
  toNumber,
  toArray,
  assertText,
  assertAmount,
  normalizeOrgNumber,
  sameText,
  coerceIsoDate,
} from "./coerce";

// ---------------------------------------------------------------------------
// Production crash reproduction: organizationNumber arrived as number 831519975
// and strategy called .replace() on it, crashing before any API call.
// ---------------------------------------------------------------------------
describe("normalizeOrgNumber — production crash regression", () => {
  test("coerces number to string and strips whitespace", () => {
    assert.equal(normalizeOrgNumber(831519975), "831519975");
  });

  test("handles string org number with spaces", () => {
    assert.equal(normalizeOrgNumber("831 519 975"), "831519975");
  });

  test("handles undefined gracefully", () => {
    assert.equal(normalizeOrgNumber(undefined), "");
  });

  test("handles null gracefully", () => {
    assert.equal(normalizeOrgNumber(null), "");
  });
});

// ---------------------------------------------------------------------------
// toText
// ---------------------------------------------------------------------------
describe("toText", () => {
  test("passes string through", () => {
    assert.equal(toText("hello"), "hello");
  });

  test("converts number to string", () => {
    assert.equal(toText(42), "42");
  });

  test("converts boolean to string", () => {
    assert.equal(toText(true), "true");
  });

  test("null → empty string", () => {
    assert.equal(toText(null), "");
  });

  test("undefined → empty string", () => {
    assert.equal(toText(undefined), "");
  });

  test("converts 0 to '0' (not empty)", () => {
    assert.equal(toText(0), "0");
  });

  test("converts false to 'false'", () => {
    assert.equal(toText(false), "false");
  });
});

// ---------------------------------------------------------------------------
// toNumber
// ---------------------------------------------------------------------------
describe("toNumber", () => {
  test("passes number through", () => {
    assert.equal(toNumber(42), 42);
  });

  test("parses string number", () => {
    assert.equal(toNumber("42.5"), 42.5);
  });

  test("handles European comma decimal", () => {
    assert.equal(toNumber("1500,50"), 1500.5);
  });

  test("handles thousands separators", () => {
    assert.equal(toNumber("1.500,50"), 1500.5);
  });

  test("returns NaN for empty string", () => {
    assert.ok(Number.isNaN(toNumber("")));
  });

  test("returns NaN for null", () => {
    assert.ok(Number.isNaN(toNumber(null)));
  });

  test("returns NaN for undefined", () => {
    assert.ok(Number.isNaN(toNumber(undefined)));
  });

  test("returns NaN for non-numeric string", () => {
    assert.ok(Number.isNaN(toNumber("abc")));
  });

  test("handles boolean true → 1", () => {
    assert.equal(toNumber(true), 1);
  });

  test("handles boolean false → 0", () => {
    assert.equal(toNumber(false), 0);
  });

  test("strips trailing percent", () => {
    assert.equal(toNumber("25%"), 25);
  });
});

// ---------------------------------------------------------------------------
// toArray
// ---------------------------------------------------------------------------
describe("toArray", () => {
  test("passes array through", () => {
    assert.deepEqual(toArray([1, 2]), [1, 2]);
  });

  test("wraps single value", () => {
    assert.deepEqual(toArray(42), [42]);
  });

  test("null → empty array", () => {
    assert.deepEqual(toArray(null), []);
  });

  test("undefined → empty array", () => {
    assert.deepEqual(toArray(undefined), []);
  });
});

// ---------------------------------------------------------------------------
// assertText
// ---------------------------------------------------------------------------
describe("assertText", () => {
  test("returns trimmed string for valid input", () => {
    assert.equal(assertText("  hello  ", "field"), "hello");
  });

  test("coerces number to string", () => {
    assert.equal(assertText(42, "field"), "42");
  });

  test("throws for empty string", () => {
    assert.throws(() => assertText("", "field"), /field must be a non-empty string/);
  });

  test("throws for whitespace-only string", () => {
    assert.throws(() => assertText("   ", "field"), /field must be a non-empty string/);
  });

  test("throws for null", () => {
    assert.throws(() => assertText(null, "field"), /field must be a non-empty string/);
  });

  test("throws for undefined", () => {
    assert.throws(() => assertText(undefined, "field"), /field must be a non-empty string/);
  });

  test("does NOT throw for number 0 (coerces to '0')", () => {
    assert.equal(assertText(0, "field"), "0");
  });
});

// ---------------------------------------------------------------------------
// assertAmount
// ---------------------------------------------------------------------------
describe("assertAmount", () => {
  test("passes positive number", () => {
    assert.equal(assertAmount(42.5, "field"), 42.5);
  });

  test("coerces string amount", () => {
    assert.equal(assertAmount("42.5", "field"), 42.5);
  });

  test("throws for zero", () => {
    assert.throws(() => assertAmount(0, "field"), /field must be a positive number/);
  });

  test("throws for negative", () => {
    assert.throws(() => assertAmount(-5, "field"), /field must be a positive number/);
  });

  test("throws for NaN input", () => {
    assert.throws(() => assertAmount("abc", "field"), /field must be a positive number/);
  });

  test("throws for null", () => {
    assert.throws(() => assertAmount(null, "field"), /field must be a positive number/);
  });
});

// ---------------------------------------------------------------------------
// sameText
// ---------------------------------------------------------------------------
describe("sameText", () => {
  test("case-insensitive match", () => {
    assert.ok(sameText("Hello", "hello"));
  });

  test("accent-insensitive match", () => {
    assert.ok(sameText("café", "cafe"));
  });

  test("handles number input", () => {
    assert.ok(sameText(42, "42"));
  });

  test("null vs empty string", () => {
    assert.ok(sameText(null, ""));
  });

  test("different strings don't match", () => {
    assert.ok(!sameText("hello", "world"));
  });
});

// ---------------------------------------------------------------------------
// coerceIsoDate
// ---------------------------------------------------------------------------
describe("coerceIsoDate", () => {
  test("passes ISO date through", () => {
    assert.equal(coerceIsoDate("2026-03-22", "fallback"), "2026-03-22");
  });

  test("converts DD.MM.YYYY", () => {
    assert.equal(coerceIsoDate("22.03.2026", "fallback"), "2026-03-22");
  });

  test("converts DD/MM/YYYY", () => {
    assert.equal(coerceIsoDate("22/03/2026", "fallback"), "2026-03-22");
  });

  test("strips time from ISO datetime", () => {
    assert.equal(coerceIsoDate("2026-03-22T10:30:00Z", "fallback"), "2026-03-22");
  });

  test("returns fallback for empty", () => {
    assert.equal(coerceIsoDate("", "2026-01-01"), "2026-01-01");
  });

  test("returns fallback for null", () => {
    assert.equal(coerceIsoDate(null, "2026-01-01"), "2026-01-01");
  });

  test("returns fallback for undefined", () => {
    assert.equal(coerceIsoDate(undefined, "2026-01-01"), "2026-01-01");
  });

  test("returns fallback for garbage", () => {
    assert.equal(coerceIsoDate("not-a-date", "2026-01-01"), "2026-01-01");
  });
});
