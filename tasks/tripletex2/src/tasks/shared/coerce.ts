/**
 * Lenient runtime coercion primitives for extractor output.
 *
 * Strategies import these to survive string/number interchange,
 * locale punctuation, and single-vs-array drift without crashing.
 */

/** Coerce any value to a string. Numbers and booleans become their string form; null/undefined become "". */
export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Coerce any value to a finite number, handling locale punctuation
 * (comma decimals, space/thin-space thousands separators) and trailing
 * percent signs.  Returns NaN when genuinely unusable.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    let s = value.trim();
    if (s.length === 0) return NaN;
    // Strip currency prefix (e.g. "NOK 500") only when followed by digits
    s = s.replace(/^[A-Z]{3}\s+(?=\d)/i, "").replace(/%$/, "").trim();
    // Strip whitespace / non-breaking space / thin space thousands separators
    s = s.replace(/[\s\u00A0\u2009]/g, "");
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Comma is decimal separator: "1.500,50" → "1500.50"
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (lastDot > lastComma && lastComma >= 0) {
      // Dot is decimal separator: "1,500.50" → "1500.50"
      s = s.replace(/,/g, "");
    }
    const parsed = Number(s);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

/** Coerce a value into an array. Wraps non-arrays into a single-element array; null/undefined become []. */
export function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value] as T[];
}

// ---------------------------------------------------------------------------
// Asserting coercers — throw only when a value is genuinely unsalvageable
// ---------------------------------------------------------------------------

/**
 * Coerce to trimmed string and assert non-empty.
 * Throws only if the result is empty after coercion.
 */
export function assertText(value: unknown, fieldName: string): string {
  const text = toText(value).trim();
  if (text.length === 0) {
    throw new Error(
      `${fieldName} must be a non-empty string, got: ${describeValue(value)}`,
    );
  }
  return text;
}

/**
 * Coerce to number and assert positive + finite.
 * Throws only if the result is not a usable positive number.
 */
export function assertAmount(value: unknown, fieldName: string): number {
  const num = toNumber(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(
      `${fieldName} must be a positive number, got: ${describeValue(value)}`,
    );
  }
  return num;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Coerce to string and strip all whitespace. Suitable for org numbers, phone, etc. */
export function normalizeOrgNumber(value: unknown): string {
  return toText(value).replace(/\s+/g, "");
}

/** Case-insensitive, accent-insensitive text comparison. Coerces both sides. */
export function sameText(left: unknown, right: unknown): boolean {
  return (
    toText(left).localeCompare(toText(right), undefined, {
      sensitivity: "base",
    }) === 0
  );
}

/**
 * Coerce a value to an ISO date string (YYYY-MM-DD).
 * Accepts ISO strings, DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, and ISO datetimes.
 * Returns `fallback` if the value cannot be parsed.
 */
export function coerceIsoDate(value: unknown, fallback: string): string {
  const str = toText(value).trim();
  if (str === "") return fallback;

  // Already ISO
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(str) &&
    !Number.isNaN(Date.parse(`${str}T00:00:00Z`))
  ) {
    return str;
  }

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0");
    const month = dmyMatch[2].padStart(2, "0");
    const year = dmyMatch[3];
    const candidate = `${year}-${month}-${day}`;
    if (!Number.isNaN(Date.parse(`${candidate}T00:00:00Z`))) return candidate;
  }

  // Strip time portion from ISO datetime
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoMatch && !Number.isNaN(Date.parse(`${isoMatch[1]}T00:00:00Z`))) {
    return isoMatch[1];
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function describeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return `${typeof value} ${JSON.stringify(value)}`;
}
