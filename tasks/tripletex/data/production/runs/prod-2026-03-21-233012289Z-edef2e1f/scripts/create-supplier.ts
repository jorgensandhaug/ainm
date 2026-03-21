const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HnxIiL5VThw_kqyRFWKZsHj2Zkb80ptofQI7QR6MXsU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Colline SARL",
    organizationNumber: "915612865",
    email: "faktura@collinesarl.no",
    invoiceEmail: "faktura@collinesarl.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));
