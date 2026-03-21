const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ybvBKGrCcjhhqnHnDYDnWOZdzVWKijTgCC_u1eQeyjg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const res = await fetch(`${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`, {
  headers: { Authorization: AUTH },
});
const data = await res.json();
console.log(JSON.stringify(data.values, null, 2));
