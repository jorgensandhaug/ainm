const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log("GET", url);
  const r = await fetch(url, { headers });
  const j = await r.json();
  console.log("  ->", r.status);
  return { status: r.status, data: j, ok: r.ok };
}

async function main() {
  // 1. Get company info
  console.log("\n=== Company ===");
  const compRes = await get("company?count=10&fields=*");
  if (compRes.ok) {
    const comp = compRes.data.values?.[0] || compRes.data.value;
    console.log("Company:", JSON.stringify(comp).slice(0, 800));
  }

  // 2. Get ledger account 1920 details - check bankAccountNumber, bankAccountCountry
  console.log("\n=== Account 1920 full details ===");
  const acctRes = await get("ledger/account?number=1920&fields=*");
  const acct = acctRes.data.values?.[0];
  console.log("Full account 1920:", JSON.stringify(acct).slice(0, 1000));

  // 3. Check if there are company bank accounts
  console.log("\n=== Company Bank Accounts (via /company/settings) ===");
  const settingsRes = await get("company/settings/altinn?fields=*");
  console.log("Settings:", JSON.stringify(settingsRes.data).slice(0, 500));

  // 4. Check bank/reconciliation/paymentType
  console.log("\n=== Bank Reconciliation Payment Types ===");
  const ptRes = await get("bank/reconciliation/paymentType?count=100&fields=*");
  const pts = ptRes.data.values || [];
  console.log("Payment types:", pts.length);
  for (const pt of pts.slice(0, 10)) {
    console.log(`  PT ${pt.id}: ${pt.description || pt.name} debitAccount=${pt.debitAccount?.number} creditAccount=${pt.creditAccount?.number}`);
  }

  // 5. Check bank reconciliation settings
  console.log("\n=== Bank Reconciliation Settings ===");
  const settRes = await get("bank/reconciliation/settings?count=10&fields=*");
  console.log("Settings:", JSON.stringify(settRes.data).slice(0, 800));

  // 6. Check open ledger postings for account 1920
  console.log("\n=== Open postings on 1920 ===");
  const postingsRes = await get("ledger/posting?dateFrom=2026-01-01&dateTo=2026-02-28&accountId=" + acct?.id + "&count=20&fields=*");
  const postings = postingsRes.data.values || [];
  console.log("Postings count:", postings.length);
  for (const p of postings.slice(0, 10)) {
    console.log(`  Posting ${p.id}: date=${p.date} amount=${p.amount} desc="${p.description}" voucherId=${p.voucher?.id}`);
  }

  // 7. Look at the reconciliation we just created
  console.log("\n=== Recent bank reconciliation ===");
  const reconRes = await get("bank/reconciliation?count=5&fields=*");
  const recons = reconRes.data.values || [];
  for (const r of recons) {
    console.log(`  Recon ${r.id}: closed=${r.isClosed} type=${r.type} balance=${r.bankAccountClosingBalanceCurrency} period=${r.accountingPeriod?.id} voucher=${r.voucher?.id}`);
  }
}

main().catch(e => console.error("FATAL:", e.message));
