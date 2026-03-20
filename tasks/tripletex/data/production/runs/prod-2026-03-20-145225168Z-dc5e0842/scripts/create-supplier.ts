const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const supplier = {
  name: "Northwave Ltd",
  organizationNumber: "949044378",
  email: "faktura@northwaveltd.no",
};

const auth = Buffer.from(`0:${token}`).toString("base64");

const response = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(supplier),
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

const created = (data as { value?: Record<string, unknown> } | null)?.value;

if (
  !created ||
  created.name !== supplier.name ||
  created.organizationNumber !== supplier.organizationNumber ||
  created.email !== supplier.email
) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  throw new Error("Create response did not match requested supplier");
}

console.log(JSON.stringify({ status: response.status, supplier: created }, null, 2));
