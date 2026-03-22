const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "FXsQAJXvtWw7x1IQdf4D_qiTFcHSUOu5soO_7HAarl0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  body: JSON.stringify([
    { "name": "Logistikk" },
    { "name": "Kundeservice" },
    { "name": "HR" }
  ]),
});

console.log("Status:", res.status);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
