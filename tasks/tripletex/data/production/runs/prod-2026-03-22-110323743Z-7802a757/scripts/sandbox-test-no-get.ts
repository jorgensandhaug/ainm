// Sandbox test: try to eliminate the GET /ledger/account call
// by posting voucher with account number/name directly
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // First, get the actual account IDs for reference
  const accts = await api("GET", "/ledger/account?number=6540,1920&fields=id,number,name");
  const rows: any[] = accts.data.values || [accts.data.value];
  const acct6540 = rows.find((a: any) => a.number === 6540);
  const acct1920 = rows.find((a: any) => a.number === 1920);
  console.log(`Reference: 6540.id=${acct6540?.id}, name=${acct6540?.name}`);
  console.log(`Reference: 1920.id=${acct1920?.id}, name=${acct1920?.name}`);

  // Use an existing dimension value from sandbox
  const dimValues = await api("GET", "/ledger/accountingDimensionValue?count=1&fields=id,displayName,dimensionIndex");
  const existingValue = dimValues.data.values?.[0];
  console.log(`Using existing dim value: id=${existingValue?.id}, name=${existingValue?.displayName}, index=${existingValue?.dimensionIndex}`);
  const dimField = `freeAccountingDimension${existingValue?.dimensionIndex}`;

  // Test 1: Try POST /ledger/voucher with account as {number: 6540, name: "Inventar"}
  console.log("\n=== Test 1: account with number + name (no id) ===");
  const t1 = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "Test no-id voucher 1",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { number: 6540, name: acct6540?.name },
        amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100,
        [dimField]: { id: existingValue?.id },
      },
      {
        row: 2,
        account: { number: 1920, name: acct1920?.name },
        amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100,
      },
    ],
  });

  // Test 2: Try with account number as string
  console.log("\n=== Test 2: account with number as string + name ===");
  const t2 = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "Test no-id voucher 2",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { number: "6540", name: acct6540?.name },
        amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100,
        [dimField]: { id: existingValue?.id },
      },
      {
        row: 2,
        account: { number: "1920", name: acct1920?.name },
        amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100,
      },
    ],
  });

  // Test 3: Try with full account object (id + number + name)
  console.log("\n=== Test 3: full account object (should work) ===");
  const t3 = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "Test full-id voucher",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct6540?.id, number: acct6540?.number, name: acct6540?.name },
        amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100,
        [dimField]: { id: existingValue?.id },
      },
      {
        row: 2,
        account: { id: acct1920?.id, number: acct1920?.number, name: acct1920?.name },
        amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100,
      },
    ],
  });

  // Test 4: Try account with just number (integer) and let Tripletex resolve
  console.log("\n=== Test 4: account number only, integer ===");
  const t4 = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "Test number-only voucher",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { number: 6540 },
        amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100,
        [dimField]: { id: existingValue?.id },
      },
      {
        row: 2,
        account: { number: 1920 },
        amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100,
      },
    ],
  });

  console.log("\n=== Summary ===");
  console.log(`Test 1 (number+name): ${t1.status}`);
  console.log(`Test 2 (string number+name): ${t2.status}`);
  console.log(`Test 3 (full object): ${t3.status}`);
  console.log(`Test 4 (number only int): ${t4.status}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
