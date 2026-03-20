const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "gIsxoB1kEaUHcLyvwPq-dR-xYaitilK84Tt3MWvVPFU";

const payload = {
  name: "Greenfield Ltd",
  organizationNumber: "872154442",
  email: "post@greenfield.no",
  postalAddress: {
    addressLine1: "Sjøgata 85",
    postalCode: "7010",
    city: "Trondheim",
  },
};

const auth = Buffer.from(`0:${token}`).toString("base64");

const response = await fetch(`${baseUrl}/customer`, {
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
  console.error(JSON.stringify({ status: response.status, body: data }, null, 2));
  process.exit(1);
}

const value = (data as { value?: any })?.value;

if (!value) {
  console.error(JSON.stringify({ error: "Missing response.value", body: data }, null, 2));
  process.exit(1);
}

const checks = [
  value.name === payload.name,
  value.organizationNumber === payload.organizationNumber,
  value.email === payload.email,
  value.postalAddress?.addressLine1 === payload.postalAddress.addressLine1,
  value.postalAddress?.postalCode === payload.postalAddress.postalCode,
  value.postalAddress?.city === payload.postalAddress.city,
];

if (checks.includes(false)) {
  console.error(
    JSON.stringify(
      {
        error: "Response verification failed",
        value,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(JSON.stringify({ id: value.id, value }, null, 2));
