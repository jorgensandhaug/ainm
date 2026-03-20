const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "0BWcv0krwCZKOATABgkADJUdPN8M7D9jYGpuidF-nW4";

const payload = {
  name: "Fjordkraft AS",
  organizationNumber: "974938901",
  email: "post@fjordkraft.no",
  postalAddress: {
    addressLine1: "Sj\u00f8gata 51",
    postalCode: "9008",
    city: "Troms\u00f8",
  },
};

const auth = Buffer.from(`0:${token}`).toString("base64");

const response = await fetch(`${baseUrl}/customer`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let data: unknown = null;

try {
  data = text ? JSON.parse(text) : null;
} catch {
  data = text;
}

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

const value = (data as { value?: Record<string, any> })?.value;

if (!value) {
  console.error(JSON.stringify({ error: "Missing value wrapper", data }, null, 2));
  process.exit(1);
}

const verified =
  value.name === payload.name &&
  value.organizationNumber === payload.organizationNumber &&
  value.email === payload.email &&
  value.postalAddress?.addressLine1 === payload.postalAddress.addressLine1 &&
  value.postalAddress?.postalCode === payload.postalAddress.postalCode &&
  value.postalAddress?.city === payload.postalAddress.city;

if (!verified) {
  console.error(JSON.stringify({ error: "Verification failed", value }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: value.id,
      name: value.name,
      organizationNumber: value.organizationNumber,
      email: value.email,
      postalAddress: value.postalAddress,
    },
    null,
    2,
  ),
);
