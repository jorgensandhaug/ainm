// Sandbox investigation: Kontorstoler receipt voucher shape
// 1. Check account 6540 (Inventar) and 1920 (bank)
// 2. Check incoming VAT types for 25%
// 3. Test voucher creation with deductible VAT

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n=== ${method} ${path} => ${res.status} ===`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, json };
}

async function main() {
  // Step 1: Check accounts 6540 and 1920
  console.log("\n--- STEP 1: Check accounts 6540, 1920 ---");
  const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=*");
  const accounts = acctRes.json?.values || [];
  for (const a of accounts) {
    console.log(`Account ${a.number}: id=${a.id}, name="${a.name}", vatLocked=${a.vatLocked}`);
    if (a.vatType) console.log(`  vatType: id=${a.vatType.id}, number=${a.vatType.number}, percentage=${a.vatType.percentage}`);
  }

  // Step 2: Check incoming VAT types
  console.log("\n--- STEP 2: Check incoming VAT types ---");
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=INCOMING&vatDate=2026-02-22&fields=*");
  const vatTypes = vatRes.json?.values || [];
  for (const v of vatTypes) {
    console.log(`VatType: id=${v.id}, number=${v.number}, name="${v.name}", percentage=${v.percentage}`);
  }

  // Step 3: Find or create department Drift
  console.log("\n--- STEP 3: Check department Drift ---");
  const deptRes = await api("GET", "/department?name=Drift&isInactive=false&fields=*");
  const depts = deptRes.json?.values || [];
  let driftId: number | null = null;
  for (const d of depts) {
    console.log(`Department: id=${d.id}, name="${d.name}"`);
    if (d.name === "Drift") driftId = d.id;
  }
  if (!driftId) {
    console.log("No exact 'Drift' department found. Creating one...");
    const createDeptRes = await api("POST", "/department", { name: "Drift" });
    driftId = createDeptRes.json?.value?.id;
    console.log(`Created department Drift: id=${driftId}`);
  }

  // Step 4: Identify the right account and VAT type
  const acct6540 = accounts.find((a: any) => a.number === 6540);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  const vat25in = vatTypes.find((v: any) => v.percentage === 25);

  if (!acct6540) {
    console.log("WARN: Account 6540 not found!");
    return;
  }
  if (!acct1920) {
    console.log("WARN: Account 1920 not found!");
    return;
  }

  console.log(`\nUsing account 6540 id=${acct6540.id}`);
  console.log(`Using account 1920 id=${acct1920.id}`);
  console.log(`Using incoming VAT 25% id=${vat25in?.id}, number=${vat25in?.number}`);
  console.log(`Using department Drift id=${driftId}`);

  // Step 5: Try voucher creation with deductible VAT
  // Kontorstoler NET: 13500, VAT: 3375, GROSS: 16875
  // Approach A: Set amountGross on expense line with vatType, let Tripletex auto-split
  console.log("\n--- STEP 5A: Voucher with amountGross + vatType on expense line ---");
  const voucherPayloadA = {
    date: "2026-02-22",
    description: "Kontorstoler",
    postings: [
      {
        row: 1,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct6540.id },
        department: { id: driftId },
        vatType: { id: vat25in?.id },
        amount: 13500,
        amountCurrency: 13500,
        amountGross: 16875,
        amountGrossCurrency: 16875,
      },
      {
        row: 2,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct1920.id },
        amount: -16875,
        amountCurrency: -16875,
        amountGross: -16875,
        amountGrossCurrency: -16875,
      },
    ],
  };
  const voucherResA = await api("POST", "/ledger/voucher", voucherPayloadA);
  if (voucherResA.status < 300) {
    const v = voucherResA.json?.value;
    console.log(`Voucher created: id=${v?.id}, number=${v?.number}`);
    console.log("Postings:");
    for (const p of v?.postings || []) {
      console.log(`  account=${p.account?.id}(${p.account?.number}), amount=${p.amount}, amountGross=${p.amountGross}, vatType=${p.vatType?.id}, dept=${p.department?.id}`);
    }
  }

  // Step 5B: Try with only amountGross set (let Tripletex compute amount from VAT)
  console.log("\n--- STEP 5B: Voucher with only amountGross, no explicit amount ---");
  const voucherPayloadB = {
    date: "2026-02-22",
    description: "Kontorstoler attempt B",
    postings: [
      {
        row: 1,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct6540.id },
        department: { id: driftId },
        vatType: { id: vat25in?.id },
        amountGross: 16875,
        amountGrossCurrency: 16875,
      },
      {
        row: 2,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct1920.id },
        amountGross: -16875,
        amountGrossCurrency: -16875,
      },
    ],
  };
  const voucherResB = await api("POST", "/ledger/voucher", voucherPayloadB);
  if (voucherResB.status < 300) {
    const v = voucherResB.json?.value;
    console.log(`Voucher created: id=${v?.id}, number=${v?.number}`);
    console.log("Postings:");
    for (const p of v?.postings || []) {
      console.log(`  account=${p.account?.id}(${p.account?.number}), amount=${p.amount}, amountGross=${p.amountGross}, vatType=${p.vatType?.id}, dept=${p.department?.id}`);
    }
  }

  // Step 5C: Try the gross-amount-everywhere approach like the representation shape
  // but with explicit vatType, to see if Tripletex adds a separate VAT posting
  console.log("\n--- STEP 5C: Voucher with gross=13500 everywhere + vatType ---");
  const voucherPayloadC = {
    date: "2026-02-22",
    description: "Kontorstoler attempt C",
    postings: [
      {
        row: 1,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct6540.id },
        department: { id: driftId },
        vatType: { id: vat25in?.id },
        amount: 13500,
        amountCurrency: 13500,
        amountGross: 13500,
        amountGrossCurrency: 13500,
      },
      {
        row: 2,
        date: "2026-02-22",
        description: "Kontorstoler",
        account: { id: acct1920.id },
        amount: -13500,
        amountCurrency: -13500,
        amountGross: -13500,
        amountGrossCurrency: -13500,
      },
    ],
  };
  const voucherResC = await api("POST", "/ledger/voucher", voucherPayloadC);
  if (voucherResC.status < 300) {
    const v = voucherResC.json?.value;
    console.log(`Voucher created: id=${v?.id}, number=${v?.number}`);
    console.log("Postings:");
    for (const p of v?.postings || []) {
      console.log(`  account=${p.account?.id}(${p.account?.number}), amount=${p.amount}, amountGross=${p.amountGross}, vatType=${p.vatType?.id}, dept=${p.department?.id}`);
    }
  }
}

main().catch(console.error);
