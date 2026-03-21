const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "DqNTNM5bDsHNXh7zGP675HIyo5wyoOWCvibTifvBhuU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify([
    { name: "Lager" },
    { name: "Økonomi" },
    { name: "Drift" },
  ]),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));
