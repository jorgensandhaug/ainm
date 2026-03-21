const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-NVArCGwTQSVZIym-vt5NUz_d9cvh1JbX9um4V6_-nU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Check voucher directly
const res1 = await fetch(
  `${BASE}/ledger/voucher/609076259?fields=*`,
  { headers: { Authorization: AUTH } }
);
console.log("Voucher status:", res1.status);
const v = await res1.json();
console.log(JSON.stringify(v.value || v, null, 2));

// Check postings for this voucher
const res2 = await fetch(
  `${BASE}/ledger/posting?dateFrom=2000-01-01&dateTo=2026-12-31&fields=*,account(*)&count=100`,
  { headers: { Authorization: AUTH } }
);
console.log("\nAll postings status:", res2.status);
const data = await res2.json();
console.log(`Total postings: ${(data.values||[]).length}`);
for (const p of data.values || []) {
  console.log(`  id=${p.id} voucher=${p.voucher?.id} account=${p.account?.number} (${p.account?.name}) amount=${p.amount} amountCurrency=${p.amountCurrency} date=${p.date}`);
}
