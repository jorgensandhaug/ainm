// Test: Does payment response include voucher/posting details with account IDs?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error("ERROR:", JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Find the unpaid invoice 2147635495
  const invRes = await api("GET", "/invoice/2147635495?fields=*,currency(*)");
  if (!invRes.ok) return;
  const inv = invRes.data.value;
  console.log(`Invoice: amount=${inv.amount}, amountCurrency=${inv.amountCurrency}, outstanding=${inv.amountOutstanding}, currency=${inv.currency?.code}`);

  // Get payment type
  const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
  const pts = ptRes.data.values || [];
  const pt = pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount === true)
    || pts.find((p: any) => p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000);
  if (!pt) { console.error("No payment type"); return; }
  console.log(`PaymentType: ${pt.id}, debitAccount: ${pt.debitAccount.number} (id=${pt.debitAccount.id})`);

  // Register payment and inspect the full response
  const payRes = await api("PUT", `/invoice/2147635495/:payment?paymentDate=2026-03-21&paymentTypeId=${pt.id}&paidAmount=${inv.amountOutstanding}`);
  console.log("\n=== Full payment response ===");
  console.log(JSON.stringify(payRes.data, null, 2));

  // Check if response has any voucher or posting references
  const val = payRes.data?.value;
  if (val) {
    console.log("\n=== Key fields in response ===");
    console.log("vouchers:", val.vouchers);
    console.log("voucherId:", val.voucherId);
    console.log("postings:", val.postings);
    // Scan all keys for anything voucher/posting related
    for (const key of Object.keys(val)) {
      const v = val[key];
      if (typeof v === 'object' && v !== null && key.toLowerCase().includes('vouch')) {
        console.log(`Found voucher-related key: ${key} =`, JSON.stringify(v));
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
