const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-NVArCGwTQSVZIym-vt5NUz_d9cvh1JbX9um4V6_-nU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Check invoice voucher postings
const res = await fetch(
  `${BASE}/ledger/posting?voucherId=609076259&fields=*,account(*)`,
  { headers: { Authorization: AUTH } }
);
const data = await res.json();
console.log("Invoice voucher postings:");
for (const p of data.values || []) {
  console.log(`  Account ${p.account?.number} (${p.account?.name}): amount=${p.amount}, amountCurrency=${p.amountCurrency}`);
}
