const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers: h });
  const j = await r.json();
  console.log(`GET ${path} -> ${r.status}`);
  return j;
}

// Check what bank accounts exist
const banks = await get("bank?count=100&fields=*");
console.log("\n=== BANKS ===");
for (const b of (banks.values || [])) {
  console.log(`  id=${b.id} name=${b.name} accountNumber=${b.accountNumber} account=${JSON.stringify(b.account)}`);
}

// Check existing bank statements
const stmts = await get("bank/statement?count=100&fields=*");
console.log("\n=== BANK STATEMENTS ===");
console.log(`Count: ${stmts.values?.length}`);
for (const s of (stmts.values || []).slice(0, 5)) {
  console.log(`  id=${s.id} fileName=${s.fileName} fromDate=${s.fromDate} toDate=${s.toDate} opening=${s.openingBalanceCurrency} closing=${s.closingBalanceCurrency}`);
}

// Check existing bank reconciliations
const recons = await get("bank/reconciliation?count=100&fields=*");
console.log("\n=== BANK RECONCILIATIONS ===");
console.log(`Count: ${recons.values?.length}`);
for (const r of (recons.values || []).slice(0, 5)) {
  console.log(`  id=${r.id} isClosed=${r.isClosed} type=${r.type} closingBalance=${r.bankAccountClosingBalanceCurrency} period=${r.accountingPeriod?.id}`);
}

// Check existing bank transactions
const txns = await get("bank/statement/transaction?count=100&fields=*");
console.log("\n=== BANK TRANSACTIONS ===");
console.log(`Count: ${txns.values?.length}`);
for (const t of (txns.values || []).slice(0, 5)) {
  console.log(`  id=${t.id} date=${t.postedDate} desc=${t.description} amount=${t.amountCurrency} matched=${t.matched}`);
}

// Check bank reconciliation matches
const matches = await get("bank/reconciliation/match?count=100&fields=*");
console.log("\n=== BANK RECON MATCHES ===");
console.log(`Count: ${matches.values?.length}`);
for (const m of (matches.values || []).slice(0, 5)) {
  console.log(`  id=${m.id} type=${m.type} txns=${m.transactions?.length} postings=${m.postings?.length}`);
}

// Check account 1920
const accts = await get("ledger/account?number=1920&fields=*");
console.log("\n=== Account 1920 ===");
for (const a of (accts.values || [])) {
  console.log(`  id=${a.id} number=${a.number} name=${a.name}`);
}
