const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "EJb64uwDRi4YV-h7ZTDj6JW2p4TqQ3M0PnS1rHna_l0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify([
    { name: "Produksjon" },
    { name: "Kvalitetskontroll" },
    { name: "HR" },
  ]),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));
