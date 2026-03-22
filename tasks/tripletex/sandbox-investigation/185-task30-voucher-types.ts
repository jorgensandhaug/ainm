/**
 * Task 30 — Investigate voucherType for year-end vouchers.
 * Maybe we need to use specific voucher types like YEAR_END_VOUCHER.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error("  ERROR:", typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data, null, 2).slice(0, 400));
  }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // 1. Check OpenAPI schema for Voucher type/voucherType
  console.log("=== 1. OpenAPI Voucher schema ===");
  const specRes = await fetch(`${BASE}/openapi.json`, { headers: { Authorization: AUTH } });
  const spec = await specRes.json();

  // Find Voucher schema
  const schemas = spec.components?.schemas || spec.definitions || {};
  for (const [name, schema] of Object.entries(schemas)) {
    if (name === "Voucher" || name === "VoucherType") {
      const props = (schema as any).properties || {};
      console.log(`\n  Schema: ${name}`);
      for (const [propName, propDef] of Object.entries(props)) {
        const p = propDef as any;
        if (propName.toLowerCase().includes("type") || propName.toLowerCase().includes("voucher")) {
          console.log(`    ${propName}: ${JSON.stringify(p).slice(0, 300)}`);
        }
      }
    }
  }

  // 2. Check VoucherType enum if it exists
  console.log("\n=== 2. VoucherType schema ===");
  for (const [name, schema] of Object.entries(schemas)) {
    if (name.toLowerCase().includes("vouchertype")) {
      console.log(`  ${name}: ${JSON.stringify(schema).slice(0, 1000)}`);
    }
  }

  // 3. GET available voucher types
  console.log("\n=== 3. GET /ledger/voucherType ===");
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=*");
  if (vtRes.ok) {
    for (const vt of vtRes.data.values || []) {
      console.log(`  id=${vt.id} name="${vt.name}" internalName="${vt.internalName}" type="${vt.type}"`);
    }
  }

  // 4. Check what voucherType values are used in existing vouchers
  console.log("\n=== 4. Existing voucher types in recent vouchers ===");
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2025-12-31&fields=id,date,description,voucherType(id,name)&count=20&sorting=-id");
  if (vRes.ok) {
    for (const v of (vRes.data.values || []).slice(0, 10)) {
      console.log(`  id=${v.id} type=${v.voucherType?.name || "null"} desc="${v.description}"`);
    }
  }

  // 5. Try posting a voucher with explicit voucherType
  console.log("\n=== 5. Test posting with different voucherTypes ===");

  // First get accounts we need
  const acctRes = await api("GET", "/ledger/account?number=6300,1700&fields=id,number,name");
  const accts: Record<number, number> = {};
  for (const a of (acctRes.data?.values || [])) {
    accts[a.number] = a.id;
  }

  if (!accts[6300] || !accts[1700]) {
    console.error("Missing required accounts");
    return;
  }

  // Try with "Årsoppgjør" or year-end related type
  const vtypes = vtRes.ok ? vtRes.data.values : [];

  // Look for year-end related types
  const yearEndTypes = vtypes.filter((vt: any) => {
    const n = ((vt.name || "") + " " + (vt.internalName || "")).toLowerCase();
    return n.includes("årsoppgjør") || n.includes("yearend") || n.includes("year_end") || n.includes("year end") || n.includes("avskrivning") || n.includes("depreciation");
  });

  console.log("\n  Year-end related voucher types:");
  for (const vt of yearEndTypes) {
    console.log(`    id=${vt.id} name="${vt.name}" internalName="${vt.internalName}"`);
  }

  // Try posting with each year-end type
  for (const vt of yearEndTypes) {
    console.log(`\n  Testing voucherType id=${vt.id} "${vt.name}":`);
    const testV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Test med voucherType ${vt.name}`,
      voucherType: { id: vt.id },
      postings: [
        { row: 1, account: { id: accts[6300] }, amountGross: 100, amountGrossCurrency: 100 },
        { row: 2, account: { id: accts[1700] }, amountGross: -100, amountGrossCurrency: -100 },
      ],
    });
    if (testV.ok) {
      console.log(`    ✓ Created voucher id=${testV.data.value.id}`);
      // Check yearEndReportPosting
      const ye = await api("GET", "/yearEnd?year=2025&fields=yearEndReportPosting");
      const yrp = ye.data?.value?.yearEndReportPosting;
      console.log(`    yearEndReportPosting: sumAmount=${yrp?.sumAmount} posts=${yrp?.posts?.length}`);

      // Clean up
      await api("DELETE", `/ledger/voucher/${testV.data.value.id}`);
    }
  }

  // 6. Also try posting WITHOUT any voucherType (default) to compare
  console.log("\n=== 6. Default voucher (no voucherType) ===");
  const defV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Test uten voucherType",
    postings: [
      { row: 1, account: { id: accts[6300] }, amountGross: 100, amountGrossCurrency: 100 },
      { row: 2, account: { id: accts[1700] }, amountGross: -100, amountGrossCurrency: -100 },
    ],
  });
  if (defV.ok) {
    console.log(`  Default voucher id=${defV.data.value.id}, type=${defV.data.value.voucherType?.name || "null"}`);
    // Check what type was assigned
    const fullV = await api("GET", `/ledger/voucher/${defV.data.value.id}?fields=*`);
    if (fullV.ok) {
      console.log(`  Full: type=${fullV.data.value.voucherType?.name} internalName=${fullV.data.value.voucherType?.internalName}`);
    }
    await api("DELETE", `/ledger/voucher/${defV.data.value.id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
