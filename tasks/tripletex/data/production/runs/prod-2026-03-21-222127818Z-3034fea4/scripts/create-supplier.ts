const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "s73glyJjfWeBXANuBDb7jYyUyxBDpSpJmHBTilYLZEM";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Dorada SL",
    organizationNumber: "958363060",
    email: "faktura@doradasl.no",
    invoiceEmail: "faktura@doradasl.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));
