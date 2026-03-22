const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bsrNPg0fINb_aTLkAqwuw-OVVdTrPe-HlZ8cfiYxHyM";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  body: JSON.stringify([
    { name: "HR" },
    { name: "Salg" },
    { name: "Økonomi" }
  ])
});

console.log("STATUS:", res.status);
const body = await res.json();
console.log("RESPONSE:", JSON.stringify(body, null, 2));
