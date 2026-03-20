const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "p8jYYdbg-DzMWWU9-xXusEihAlPraCDTQPM3wLsHFZI";

const supplier = {
  name: "Cascade SARL",
  organizationNumber: "997712560",
  email: "faktura@cascadesarl.no",
  invoiceEmail: "faktura@cascadesarl.no",
};

const url = new URL("supplier", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(supplier),
});

const raw = await response.text();
let data: unknown = null;
if (raw) {
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
}

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, body: data }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
