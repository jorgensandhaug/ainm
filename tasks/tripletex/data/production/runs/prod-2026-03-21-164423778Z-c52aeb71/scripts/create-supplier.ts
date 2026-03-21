const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "i8-SaRgHTInOy98nrVnApOeTeCwiizifNFaIpTIRRac";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const resp = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Rivière SARL",
    organizationNumber: "853420409",
    email: "faktura@riviresarl.no",
    invoiceEmail: "faktura@riviresarl.no",
  }),
});

console.log("Status:", resp.status);
const body = await resp.json();
console.log(JSON.stringify(body, null, 2));
