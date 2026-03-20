const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "rS514iA_ZQ4jlkadnofkFDmsV4XYyp0IdwGlPjJy1tY";

const url = `${baseUrl.replace(/\/+$/, "")}/supplier`;
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

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

const rawBody = await response.text();
let body: unknown = null;

try {
  body = rawBody ? JSON.parse(rawBody) : null;
} catch {
  body = rawBody;
}

if (!response.ok) {
  const errorMessage =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;

  if (
    response.status === 403 &&
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    (errorMessage === "Invalid or expired token" ||
      errorMessage ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  ) {
    throw new Error(`Blocked credentials: ${JSON.stringify(body)}`);
  }

  throw new Error(`Tripletex request failed: ${response.status} ${rawBody}`);
}

console.log(JSON.stringify(body, null, 2));
