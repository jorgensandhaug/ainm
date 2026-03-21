const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "5egXY8VJ2GNytdFRUK6enZi9f7Q3d3ss7H8AYQHreWg";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Fossekraft AS",
    organizationNumber: "977371635",
    email: "faktura@fossekraft.no",
    invoiceEmail: "faktura@fossekraft.no",
  }),
});

console.log("Status:", res.status);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
