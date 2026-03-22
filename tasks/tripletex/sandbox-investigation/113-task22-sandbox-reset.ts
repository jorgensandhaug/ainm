/**
 * Sandbox reset for task 22 testing.
 * Deletes non-baseline vouchers dated in 2026 and non-baseline departments.
 * Uses the sandbox-baseline.json to identify what's "original."
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any): Promise<{ status: number; data: any }> {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // Load baseline
  const baselineFile = Bun.file("data/sandbox-baseline.json");
  const baseline = await baselineFile.json();
  const baselineVoucherIds = new Set<number>(baseline.resources.vouchers || []);
  const baselineDeptIds = new Set<number>(baseline.resources.departments || []);

  console.log(`Baseline: ${baselineVoucherIds.size} vouchers, ${baselineDeptIds.size} departments\n`);

  // === Delete non-baseline 2026 vouchers ===
  console.log("=== Fetching 2026 vouchers ===");
  const v2026 = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2027-01-01&fields=id,number,date,description&count=5000");
  const vouchers2026 = v2026.data.values || [];
  console.log(`Total 2026 vouchers: ${vouchers2026.length}`);

  const toDeleteVouchers = vouchers2026.filter((v: any) => !baselineVoucherIds.has(v.id));
  console.log(`Non-baseline 2026 vouchers to delete: ${toDeleteVouchers.length}`);

  let deletedV = 0, failedV = 0;
  for (const v of toDeleteVouchers) {
    const r = await api("DELETE", `/ledger/voucher/${v.id}`);
    if (r.status < 300) {
      deletedV++;
    } else {
      failedV++;
      console.log(`  FAIL delete voucher #${v.number} (${v.description}) id=${v.id}: ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
    }
  }
  console.log(`Deleted: ${deletedV}, Failed: ${failedV}\n`);

  // === Delete non-baseline departments ===
  console.log("=== Fetching departments ===");
  const depts = await api("GET", "/department?isInactive=false&fields=id,name&count=1000");
  const allDepts = depts.data.values || [];
  console.log(`Total active departments: ${allDepts.length}`);

  const toDeleteDepts = allDepts.filter((d: any) => !baselineDeptIds.has(d.id));
  console.log(`Non-baseline departments: ${toDeleteDepts.length}`);

  let deletedD = 0, failedD = 0;
  for (const d of toDeleteDepts) {
    // Try DELETE first, fall back to deactivation
    const r = await api("DELETE", `/department/${d.id}`);
    if (r.status < 300) {
      deletedD++;
      console.log(`  Deleted dept "${d.name}" id=${d.id}`);
    } else {
      // Try PUT to deactivate
      const r2 = await api("PUT", `/department/${d.id}`, { id: d.id, name: d.name, isInactive: true });
      if (r2.status < 300) {
        deletedD++;
        console.log(`  Deactivated dept "${d.name}" id=${d.id}`);
      } else {
        failedD++;
        console.log(`  FAIL dept "${d.name}" id=${d.id}: DELETE=${r.status}, PUT=${r2.status}`);
      }
    }
  }
  console.log(`Cleaned: ${deletedD}, Failed: ${failedD}\n`);

  // === Verify clean state ===
  console.log("=== Verification ===");
  const v2026After = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2027-01-01&fields=id,number&count=1000");
  const remaining2026 = (v2026After.data.values || []).filter((v: any) => !baselineVoucherIds.has(v.id));
  console.log(`Remaining non-baseline 2026 vouchers: ${remaining2026.length}`);

  const deptsAfter = await api("GET", "/department?isInactive=false&fields=id,name&count=1000");
  const remainingDepts = (deptsAfter.data.values || []).filter((d: any) => !baselineDeptIds.has(d.id));
  console.log(`Remaining non-baseline active departments: ${remainingDepts.length}`);

  if (remaining2026.length === 0 && remainingDepts.length === 0) {
    console.log("\n✓ Sandbox is clean for testing!");
  } else {
    console.log("\n⚠ Sandbox not fully clean:");
    for (const v of remaining2026) console.log(`  voucher: #${v.number} id=${v.id}`);
    for (const d of remainingDepts) console.log(`  dept: "${d.name}" id=${d.id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
