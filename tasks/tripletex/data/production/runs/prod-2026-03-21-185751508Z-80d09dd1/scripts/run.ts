const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "1b7dC1JmDrOBov31C_K_JUZsJN0C8TRyFe-Wg1bCqS4";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Silveroak Ltd",
    organizationNumber: "889586605",
    email: "faktura@silveroakltd.no",
    invoiceEmail: "faktura@silveroakltd.no",
  }),
});

console.log("Status:", res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
