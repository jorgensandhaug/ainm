const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "KYfF0GLr4lHyDP6aOTU17qNsriDIPAtY-siGz5tc8dg";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Lumière SARL",
    organizationNumber: "879852439",
    email: "faktura@lumiresarl.no",
    invoiceEmail: "faktura@lumiresarl.no",
  }),
});

console.log("STATUS:", res.status);
const body = await res.json();
console.log("BODY:", JSON.stringify(body, null, 2));
