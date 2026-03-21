const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // Q1: Can GET /ledger/account use comma-separated numbers to save a call?
  console.log("=== Q1: Can GET /ledger/account use comma-separated numbers? ===");
  const accComma = await api("GET", "/ledger/account?number=5000,1920&count=10&fields=*");
  console.log(`Results: ${accComma.data.values?.length || 0} accounts`);
  if (accComma.data.values) {
    for (const a of accComma.data.values) {
      console.log(`  number=${a.number} id=${a.id} name="${a.name}"`);
    }
  }

  // Q2: What voucherType IDs exist in sandbox?
  console.log("\n=== Q2: Sandbox voucherType IDs ===");
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=*");
  const types = vtRes.data.values || [];
  for (const t of types) {
    console.log(`  id=${t.id} name="${t.name}"`);
  }
  const lonnType = types.find((t: any) => t.name === "Lønnsbilag");
  console.log(`\nSandbox Lønnsbilag id: ${lonnType?.id}`);
  console.log(`Production Lønnsbilag id was: 8145240`);
  console.log(`Previously assumed 'stable' id was: 9744848`);

  // Q3: Can we look up voucherType by name filter?
  console.log("\n=== Q3: Can we filter voucherType by name? ===");
  const vtFilter = await api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*");
  console.log(`Filtered results: ${vtFilter.data.values?.length || 0}`);
  if (vtFilter.data.values?.[0]) {
    console.log(`  id=${vtFilter.data.values[0].id} name="${vtFilter.data.values[0].name}"`);
  }

  // Q4: Test voucher creation with row field in sandbox
  console.log("\n=== Q4: Test voucher with explicit row fields ===");
  // First get accounts
  const acc5000 = accComma.data.values?.find((a: any) => a.number === 5000);
  const acc1920 = accComma.data.values?.find((a: any) => a.number === 1920);
  if (!acc5000 || !acc1920) {
    console.log("Cannot test voucher - accounts not found");
    return;
  }

  // Test with row field
  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Sandbox test - Lønn mars 2026 row test",
    voucherType: { id: lonnType!.id },
    postings: [
      {
        row: 1,
        account: { id: acc5000.id },
        amount: 37850,
        amountCurrency: 37850,
        amountGross: 37850,
        amountGrossCurrency: 37850,
        description: "Fastlønn mars 2026",
      },
      {
        row: 2,
        account: { id: acc5000.id },
        amount: 9200,
        amountCurrency: 9200,
        amountGross: 9200,
        amountGrossCurrency: 9200,
        description: "Bonus mars 2026",
      },
      {
        row: 3,
        account: { id: acc1920.id },
        amount: -47050,
        amountCurrency: -47050,
        amountGross: -47050,
        amountGrossCurrency: -47050,
        description: "Lønn mars 2026",
      },
    ],
  });
  if (vRes.ok) {
    console.log(`Voucher created: id=${vRes.data.value?.id}, number=${vRes.data.value?.number}`);
  } else {
    console.log("FAILED:", JSON.stringify(vRes.data, null, 2).substring(0, 500));
  }

  // Q5: Test voucher WITHOUT row field for comparison
  console.log("\n=== Q5: Test voucher WITHOUT row field ===");
  const vRes2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Sandbox test - Lønn mars 2026 no row test",
    voucherType: { id: lonnType!.id },
    postings: [
      {
        account: { id: acc5000.id },
        amount: 37850,
        amountCurrency: 37850,
        amountGross: 37850,
        amountGrossCurrency: 37850,
        description: "Fastlønn test",
      },
      {
        account: { id: acc1920.id },
        amount: -37850,
        amountCurrency: -37850,
        amountGross: -37850,
        amountGrossCurrency: -37850,
        description: "Bank test",
      },
    ],
  });
  if (vRes2.ok) {
    console.log(`Voucher created WITHOUT row: id=${vRes2.data.value?.id}, number=${vRes2.data.value?.number}`);
  } else {
    console.log("FAILED without row:", JSON.stringify(vRes2.data, null, 2).substring(0, 500));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
