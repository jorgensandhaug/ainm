const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  // Check bank statements on account 1920
  const r = await fetch(`${BASE}/bank/statement?fields=*&count=100`, {
    headers: { Authorization: AUTH },
  });
  const j = await r.json();
  console.log("Bank statements:", r.status);
  for (const s of j.values || []) {
    console.log(`  id=${s.id} | from=${s.fromDate} | to=${s.toDate} | closed=${s.isClosed} | account=${s.account?.id}`);
  }

  // Try date 2026-12-15 (far future)
  const r2 = await fetch(`${BASE}/ledger/voucher?sendToLedger=true`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      date: "2026-12-15",
      description: "Tastatur sandbox test",
      postings: [
        { row: 1, date: "2026-12-15", description: "Tastatur", account: { id: 486897858 }, department: { id: 992303 }, vatType: { id: 1 }, amountGross: 8625, amountGrossCurrency: 8625 },
        { row: 2, date: "2026-12-15", description: "Tastatur", account: { id: 486897588 }, amountGross: -8625, amountGrossCurrency: -8625 },
      ],
    }),
  });
  const j2 = await r2.json();
  console.log("\nVoucher POST (2026-12-15):", r2.status);
  if (r2.ok) {
    const v = j2.value;
    console.log(`  id=${v.id}, number=${v.number}`);
    for (const p of v.postings) {
      console.log(`  row=${p.row} | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id} | dept=${p.department?.id} | sysGen=${p.systemGenerated}`);
    }
  } else {
    console.log(JSON.stringify(j2, null, 2));
  }
}
main();
