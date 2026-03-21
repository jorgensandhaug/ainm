const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Read voucher 341 (609121403) with full expansion on postings
  const res = await fetch(`${BASE}/ledger/voucher/609121403?fields=id,number,postings(account(number,name),amount,amountGross,project(id,name),supplier(id,name),description)`, {
    headers: H,
  });
  const data = await res.json();
  console.log("Voucher 341 (Leverandørfaktura with supplier on 2400):");
  for (const p of (data.value?.postings || [])) {
    console.log(`  acct=${p.account?.number} "${p.account?.name}" amt=${p.amount} amtGross=${p.amountGross} desc="${p.description}" proj=${p.project?.id || 'null'} supp=${p.supplier?.id || 'null'} "${p.supplier?.name || ''}"`)
  }

  // Also read voucher 340 (609121120) - the one without supplier
  const res2 = await fetch(`${BASE}/ledger/voucher/609121120?fields=id,number,postings(account(number,name),amount,amountGross,project(id,name),supplier(id,name),description)`, {
    headers: H,
  });
  const data2 = await res2.json();
  console.log("\nVoucher 340 (Leverandørfaktura without supplier):");
  for (const p of (data2.value?.postings || [])) {
    console.log(`  acct=${p.account?.number} "${p.account?.name}" amt=${p.amount} amtGross=${p.amountGross} desc="${p.description}" proj=${p.project?.id || 'null'} supp=${p.supplier?.id || 'null'}`);
  }

  // Check the Fossekraft voucher to understand the pattern
  // Search for vouchers with project=401998770
  const res3 = await fetch(`${BASE}/ledger/posting?dateFrom=2026-01-01&dateTo=2026-12-31&projectId=401998770&fields=voucher(id,number),account(number),amount,project(id),supplier(id,name),description&count=10`, {
    headers: H,
  });
  const data3 = await res3.json();
  console.log("\nPostings with Fossekraft project 401998770:");
  for (const p of (data3.values || [])) {
    console.log(`  voucher=#${p.voucher?.number} acct=${p.account?.number} amt=${p.amount} proj=${p.project?.id || '-'} supp=${p.supplier?.id || '-'} "${p.supplier?.name || ''}" desc="${p.description}"`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
