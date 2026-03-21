const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-NVArCGwTQSVZIym-vt5NUz_d9cvh1JbX9um4V6_-nU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(
  `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`,
  { headers: { Authorization: AUTH } }
);
const data = await res.json();
for (const inv of data.values || []) {
  console.log(JSON.stringify(inv, null, 2));
}
