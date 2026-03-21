const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const r = await fetch(url, { method, headers: H });
  const data = await r.json();
  console.log(`<<< ${r.status}`);
  return data;
}

async function main() {
  // Check the payment voucher for EUR invoice 2147608960
  // The payment posting was on voucher 609029215
  console.log("=== VOUCHER 609029215 (EUR payment) ===");
  const vRes = await api("GET", "/ledger/voucher/609029215?fields=*,postings(*,account(*))");
  if (vRes.value) {
    console.log(`Voucher: ${vRes.value.description}`);
    console.log(`Postings:`);
    for (const p of vRes.value.postings || []) {
      console.log(`  row=${p.row} acct=${p.account?.number} (${p.account?.name}) amount=${p.amount} amountCurrency=${p.amountCurrency} desc=${p.description?.substring(0, 60)}`);
    }
  }

  // Also check the NOK mismatch voucher
  console.log("\n=== PAYMENT VOUCHER FOR NOK MISMATCH INVOICE 2147609133 ===");
  // Need to find the voucher ID - it's the voucher for posting 3845479211
  const postRes = await api("GET", "/ledger/posting/3845479211?fields=*,voucher(*)");
  if (postRes.value) {
    const vid = postRes.value.voucher?.id;
    console.log(`Voucher ID: ${vid}`);
    if (vid) {
      const vRes2 = await api("GET", `/ledger/voucher/${vid}?fields=*,postings(*,account(*))`);
      if (vRes2.value) {
        console.log(`Voucher: ${vRes2.value.description}`);
        for (const p of vRes2.value.postings || []) {
          console.log(`  row=${p.row} acct=${p.account?.number} (${p.account?.name}) amount=${p.amount} amountCurrency=${p.amountCurrency}`);
        }
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
