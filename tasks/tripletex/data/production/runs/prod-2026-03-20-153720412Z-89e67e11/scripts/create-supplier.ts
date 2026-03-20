const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "QyR7YBzTxbA46Vtru-qMHObfQBpE1KNkW3l8w58UjTo";

const payload = {
  name: "Silveroak Ltd",
  organizationNumber: "811867500",
  email: "faktura@silveroakltd.no",
};

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let data: unknown = null;

if (text) {
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
}

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

const supplier = (data as { value?: Record<string, unknown> } | null)?.value;

if (
  !supplier ||
  supplier.name !== payload.name ||
  supplier.organizationNumber !== payload.organizationNumber ||
  supplier.email !== payload.email
) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: response.status, supplier }, null, 2));
