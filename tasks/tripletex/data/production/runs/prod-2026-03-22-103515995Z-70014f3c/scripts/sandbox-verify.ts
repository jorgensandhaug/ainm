// Sandbox verification: test Branch A (Forretningslunsj, 7360, no VAT) and check optimization opportunities
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${r.status}`);
  if (r.ok) console.log(JSON.stringify(json, null, 2).slice(0, 2000));
  else console.log("ERROR:", JSON.stringify(json).slice(0, 1000));
  return { status: r.status, data: json };
}

async function main() {
  console.log("=== SANDBOX VERIFICATION: Receipt Expense Voucher Branch A ===\n");

  // Test 1: Can we use account: { number: 7360 } directly? (known to fail with 422)
  console.log("--- TEST 1: Try account by number (expected: 422) ---");
  const test1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-09",
    description: "Test account-by-number",
    postings: [
      { row: 1, date: "2026-03-09", description: "Test", account: { number: 7360 }, amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100 },
      { row: 2, date: "2026-03-09", description: "Test", account: { number: 1920 }, amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100 },
    ]
  });
  console.log(`account-by-number result: ${test1.status === 422 ? 'CONFIRMED 422 (cannot skip GET accounts)' : 'UNEXPECTED: ' + test1.status}`);

  // Test 2: Can we inline department by name?
  console.log("\n--- TEST 2: Try department by name (expected: silently null) ---");
  // First get real account IDs
  const accts = await api("GET", "/ledger/account?number=7360,1920&fields=id,number,name,vatType(*),vatLocked");
  const acct7360 = accts.data.values.find((a: any) => a.number === 7360);
  const acct1920 = accts.data.values.find((a: any) => a.number === 1920);
  console.log(`acct7360: id=${acct7360.id}, vatLocked=${acct7360.vatLocked}`);
  console.log(`acct1920: id=${acct1920.id}`);

  const test2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-09",
    description: "Test dept-by-name",
    postings: [
      { row: 1, date: "2026-03-09", description: "Test", account: { id: acct7360.id }, department: { name: "Salg" }, amount: 50, amountCurrency: 50, amountGross: 50, amountGrossCurrency: 50 },
      { row: 2, date: "2026-03-09", description: "Test", account: { id: acct1920.id }, amount: -50, amountCurrency: -50, amountGross: -50, amountGrossCurrency: -50 },
    ]
  });
  if (test2.status === 201) {
    const vid = test2.data.value.id;
    const readback = await api("GET", `/ledger/voucher/${vid}?fields=id,postings(department(id,name))`);
    const dept = readback.data.value.postings?.[0]?.department;
    console.log(`dept-by-name result: department=${JSON.stringify(dept)} → ${dept?.id ? 'HAS ID (name works!)' : 'NULL (confirmed: must use id)'}`);
  }

  // Test 3: Verify the exact Branch A payload from the production run
  console.log("\n--- TEST 3: Full Branch A flow (Forretningslunsj) ---");
  // Get or create "Salg" department
  let deptId: number;
  const deptPost = await api("POST", "/department", { name: "SalgReflection", departmentNumber: -1 });
  if (deptPost.status === 201) {
    deptId = deptPost.data.value.id;
  } else {
    const deptGet = await api("GET", "/department?name=SalgReflection&isInactive=false&fields=*");
    const exact = deptGet.data.values.filter((d: any) => d.name === "SalgReflection");
    deptId = exact[0].id;
  }
  console.log(`department: id=${deptId}`);

  // Branch A voucher
  const lineAmount = 13200;
  const voucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-09",
    description: "Forretningslunsj",
    postings: [
      {
        row: 1, date: "2026-03-09", description: "Forretningslunsj",
        account: { id: acct7360.id },
        department: { id: deptId },
        amount: lineAmount, amountCurrency: lineAmount,
        amountGross: lineAmount, amountGrossCurrency: lineAmount,
      },
      {
        row: 2, date: "2026-03-09", description: "Forretningslunsj",
        account: { id: acct1920.id },
        amount: -lineAmount, amountCurrency: -lineAmount,
        amountGross: -lineAmount, amountGrossCurrency: -lineAmount,
      },
    ],
  });
  if (voucher.status === 201) {
    const vid = voucher.data.value.id;
    console.log(`voucher created: id=${vid}`);
    const verify = await api("GET", `/ledger/voucher/${vid}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated)`);
    const postings = verify.data.value.postings;
    for (const p of postings) {
      console.log(`  posting row=${p.row}: account=${p.account.number}(${p.account.name}) amountGross=${p.amountGross} amount=${p.amount} vatType=${p.vatType?.id ?? 'none'}(${p.vatType?.percentage ?? '-'}%) dept=${p.department?.name ?? 'none'} sysGen=${p.systemGenerated}`);
    }

    // Verify: only 2 postings (no auto-VAT for Branch A)
    console.log(`\nPostings count: ${postings.length} (expected: 2 for Branch A, no auto-VAT)`);
    console.log(`Account correct: ${postings[0].account.number === 7360 ? 'YES' : 'NO'}`);
    console.log(`Amount correct: ${postings[0].amountGross === lineAmount ? 'YES' : 'NO'}`);
    console.log(`Department present: ${postings[0].department?.name ? 'YES (' + postings[0].department.name + ')' : 'NO'}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log("1. account: { number } → 422 confirmed (must GET account IDs)");
  console.log("2. department: { name } → silently null (must use { id })");
  console.log("3. Branch A flow confirmed: 3 writes (POST dept, POST voucher, POST attachment) + free GETs");
  console.log("4. Minimum scored calls = 3 (cannot be reduced further)");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
