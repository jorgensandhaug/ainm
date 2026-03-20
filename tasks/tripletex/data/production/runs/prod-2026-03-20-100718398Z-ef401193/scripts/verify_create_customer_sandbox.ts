const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const suffix = Date.now().toString().slice(-6);
const payload = {
  name: `Codex Post Run ${suffix} AS`,
  email: `codex-post-run-${suffix}@example.no`,
  organizationNumber: `999${suffix}`,
};

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const response = await fetch(`${baseUrl}/customer`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const raw = await response.text();
let body: unknown = null;

if (raw) {
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
}

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        body,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (!body || typeof body !== "object" || !("value" in body)) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: "Unexpected response envelope",
        body,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const customer = (body as { value: Record<string, unknown> }).value;

for (const [key, expected] of Object.entries(payload)) {
  if (customer[key] !== expected) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: `Mismatch for ${key}`,
          expected,
          actual: customer[key],
          customer,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      id: customer.id,
      name: customer.name,
      email: customer.email,
      organizationNumber: customer.organizationNumber,
      invoiceSendMethod: customer.invoiceSendMethod,
      emailAttachmentType: customer.emailAttachmentType,
    },
    null,
    2,
  ),
);
