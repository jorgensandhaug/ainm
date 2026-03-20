const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "rtC_9-mdKXVXsJlp9lEmzhA5TTkBRzzLCC6A-yz_Bos";

const payload = {
  name: "Bergvik AS",
  organizationNumber: "978783864",
  email: "faktura@bergvik.no",
  invoiceEmail: "faktura@bergvik.no",
};

function buildUrl(base: string, path: string): string {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function main() {
  const response = await fetch(buildUrl(baseUrl, "supplier"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (
    response.status === 403 &&
    data &&
    typeof data.error === "string" &&
    data.error === "Invalid or expired token"
  ) {
    throw new Error(`Blocked by unusable credentials: ${text}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const value = data?.value;
  if (!value) {
    throw new Error(`Missing response.value: ${text}`);
  }

  const checks: Array<[string, unknown, unknown]> = [
    ["name", value.name, payload.name],
    ["organizationNumber", value.organizationNumber, payload.organizationNumber],
    ["email", value.email, payload.email],
    ["invoiceEmail", value.invoiceEmail, payload.invoiceEmail],
  ];

  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(
        `Unexpected ${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        id: value.id,
        name: value.name,
        organizationNumber: value.organizationNumber,
        email: value.email,
        invoiceEmail: value.invoiceEmail,
      },
      null,
      2
    )
  );
}

await main();
