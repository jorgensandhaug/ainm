// Deep investigation: what does the prepaid reversal look like after posting?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${path}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.log(`  ERR ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  else console.log(`  → ${res.status}`);
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // Get account IDs
  const acctRes = await api("GET", "/ledger/account?number=1700,6300&fields=id,number,name");
  const accounts: Record<number, number> = {};
  for (const a of acctRes.data.values) accounts[a.number] = a.id;
  console.log("Account IDs:", accounts);

  // Post a prepaid reversal voucher
  console.log("\n=== POSTING PREPAID REVERSAL ===");
  const vRes = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      {
        row: 1,
        account: { id: accounts[6300] },
        amountGross: 65700,
        amountGrossCurrency: 65700,
        description: "Periodisering leiekostnad",
      },
      {
        row: 2,
        account: { id: accounts[1700] },
        amountGross: -65700,
        amountGrossCurrency: -65700,
        description: "Forskuddsbetalte kostnader",
      },
    ],
  });

  if (vRes.ok) {
    console.log("Voucher created:", JSON.stringify(vRes.data.value, null, 2).slice(0, 2000));

    // Read the voucher back with full details
    const vid = vRes.data.value.id;
    console.log("\n=== READING BACK VOUCHER ===");
    const readRes = await api("GET", `/ledger/voucher/${vid}?fields=*,postings(*,account(id,number,name))`);
    if (readRes.ok) {
      console.log("Full voucher:", JSON.stringify(readRes.data.value, null, 2));
    }
  }

  // Also check: what voucher types exist?
  console.log("\n=== VOUCHER TYPES ===");
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=id,name");
  if (vtRes.ok) {
    for (const vt of vtRes.data.values) {
      console.log(`  ${vt.id}: ${vt.name}`);
    }
  }

  // Check balance sheet for account 1700 specifically
  console.log("\n=== BALANCE SHEET FOR 1700 ===");
  const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1701&fields=*,account(id,number,name)");
  if (bsRes.ok) {
    for (const row of bsRes.data.values) {
      console.log(`  ${row.account.number} ${row.account.name}: balIn=${row.balanceIn} balOut=${row.balanceOut}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
