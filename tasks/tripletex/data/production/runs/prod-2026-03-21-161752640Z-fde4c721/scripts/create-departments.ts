const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bce01hz5CXeNvycywRtHfcdApLs3z-3FXQJnLVET5WE";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify([
    { name: "HR" },
    { name: "Lager" },
    { name: "IT" },
  ]),
});

console.log("Status:", res.status);
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
