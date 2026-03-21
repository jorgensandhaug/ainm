const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "eoUAsMmG9LVdN90YXo9CRsoXzMDvJkpqynue3iavdm8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify([
    { name: "Logistikk" },
    { name: "Salg" },
    { name: "Drift" },
  ]),
});

console.log("Status:", res.status);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
