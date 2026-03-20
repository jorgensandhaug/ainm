const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "xzMktRiGo1HfvpcGux4aTdrvQ0NzWk83qrkQsqfEnGY";

const url = new URL("supplier", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${token}`).toString("base64");
const payload = {
  name: "Northwave Ltd",
  organizationNumber: "949044378",
  email: "faktura@northwaveltd.no",
  invoiceEmail: "faktura@northwaveltd.no",
};

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let body: unknown = null;
if (text) {
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
}

if (response.status === 403) {
  const errorText =
    typeof body === "string" ? body : JSON.stringify(body ?? {});
  if (
    errorText.includes("Invalid or expired token") ||
    errorText.includes("Invalid or expired proxy token")
  ) {
    throw new Error(`Blocked by credentials: ${errorText}`);
  }
}

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${JSON.stringify(body ?? {})}`);
}

const value =
  body && typeof body === "object" && "value" in body
    ? (body as { value: Record<string, unknown> }).value
    : null;

if (!value) {
  throw new Error(`Missing response.value: ${JSON.stringify(body ?? {})}`);
}

for (const [key, expected] of Object.entries(payload)) {
  if (value[key] !== expected) {
    throw new Error(
      `Unexpected ${key}: got ${JSON.stringify(value[key])}, expected ${JSON.stringify(expected)}`,
    );
  }
}

console.log(JSON.stringify(value, null, 2));
