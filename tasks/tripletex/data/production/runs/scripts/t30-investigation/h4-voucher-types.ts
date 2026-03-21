// Hypothesis 4: Voucher type matters
// Maybe depreciation/tax/disposition vouchers should use a specific voucherType field.
// Check what voucher types exist.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const data = await res.json();
  console.log(`GET ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
    return null;
  }
  return data;
}

async function main() {
  // Get all voucher types
  console.log("=== Voucher Types ===");
  const vtRes = await api("/ledger/voucherType?count=100&fields=*");
  if (!vtRes) return;

  for (const vt of (vtRes.values || [])) {
    console.log(`  id=${vt.id}, name="${vt.name}", displayName="${vt.displayName}", number=${vt.number}, isInactive=${vt.isInactive}`);
  }
  console.log(`Total: ${vtRes.values?.length}`);

  // Also check what existing vouchers look like (what type did they get assigned?)
  console.log("\n=== Recent vouchers (to see default voucherType) ===");
  const vRes = await api("/ledger/voucher?dateFrom=2025-12-01&dateTo=2026-01-02&count=20&fields=id,date,description,voucherType(*)");
  if (!vRes) return;

  for (const v of (vRes.values || [])) {
    console.log(`  id=${v.id}, date=${v.date}, desc="${v.description}", voucherType: id=${v.voucherType?.id}, name="${v.voucherType?.name}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
