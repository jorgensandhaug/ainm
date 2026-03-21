const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "CziPscGXUWHhzm2SDpNDZko7w04J1GTCkC8MWQSUg5Q";
const auth = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: auth },
  body: JSON.stringify({
    name: "Rivière SARL",
    organizationNumber: "853420409",
    email: "faktura@riviresarl.no",
    invoiceEmail: "faktura@riviresarl.no",
  }),
});

console.log("status:", res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
