const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bMew8RNvHH2V_jqR3T1nvYjyNvfmbOpmuRCy-ZcvmQI";
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
console.log("STATUS:", res.status);
console.log("RESPONSE:", JSON.stringify(body, null, 2));
