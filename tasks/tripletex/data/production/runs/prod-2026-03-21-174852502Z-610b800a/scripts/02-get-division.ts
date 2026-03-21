const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "8UOaswTtubjEVJ-YMABzuLORlFpPHCjjhniAe2jTut8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/division?count=1&fields=*`, {
  headers: { Authorization: AUTH },
});
const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
