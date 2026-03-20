const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const suffix = "321000002";
const payload = {
  name: `Codex Reflection Supplier ${suffix}`,
  organizationNumber: suffix,
  email: `supplier-${suffix}@example.no`,
};

const auth = Buffer.from(`0:${token}`).toString("base64");

const response = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
const data = text ? JSON.parse(text) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

const supplier = data?.value;

if (
  !supplier ||
  supplier.name !== payload.name ||
  supplier.organizationNumber !== payload.organizationNumber ||
  supplier.email !== payload.email
) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  throw new Error("Supplier create verification failed");
}

console.log(JSON.stringify({ status: response.status, supplier }, null, 2));
