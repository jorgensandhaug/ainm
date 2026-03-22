// Sandbox investigation: test posting-level vatType detection for missing-VAT
// Use March 2026 dates to avoid reconciled period conflicts

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) { console.error(`HTTP ${res.status} ${method} ${path}: ${text.substring(0, 400)}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // Step 1: Get account IDs
  const acctRes = await api("GET", "/ledger/account?number=6540,2710,7300,1500&fields=id,number,name,vatType(id)");
  if (!acctRes) return;
  const acctByNum: Record<number, { id: number; vatTypeId: number }> = {};
  const acctById: Record<number, number> = {};
  for (const a of acctRes.values) {
    console.log(`  ${a.number} (id=${a.id}): vatType=${a.vatType?.id ?? "none"}`);
    acctByNum[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
    acctById[a.id] = a.number;
  }

  // Use account 1500 as non-bank contra to avoid bank reconciliation issues
  const contraAcct = acctByNum[1500]?.id;
  if (!contraAcct) {
    console.log("Account 1500 not found, trying to find a suitable contra...");
    const contraRes = await api("GET", "/ledger/account?number=1400&fields=id,number,name,vatType(id)");
    console.log("Contra:", contraRes?.values);
    return;
  }

  // Step 2: Create Voucher A (correct): 6540 with vatType=1
  console.log("\n=== Voucher A: 6540 with vatType=1 (correct, should have 2710 posting) ===");
  const vA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-15",
    description: "Test correct booking (with VAT)",
    postings: [
      { row: 1, account: { id: acctByNum[6540].id }, amountGross: 13000, amountGrossCurrency: 13000,
        vatType: { id: acctByNum[6540].vatTypeId }, description: "6540 with VAT" },
      { row: 2, account: { id: contraAcct }, amountGross: -13000, amountGrossCurrency: -13000,
        description: "Contra 1500" },
    ],
  });
  if (vA) {
    console.log(`  Created id=${vA.value.id}`);
    for (const p of vA.value.postings) {
      console.log(`    acct=${p.account?.number ?? acctById[p.account?.id]}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  // Step 3: Create Voucher B (error): 6540 with vatType=0, PLUS 7300 with vatType=1
  // This mimics the production scenario where the error voucher has a 2710 posting
  // from another line, not from the 6540 posting
  console.log("\n=== Voucher B: 6540 vatType=0 (error) + 7300 vatType=1 (generates 2710) ===");
  const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-20",
    description: "Test missing VAT booking",
    postings: [
      { row: 1, account: { id: acctByNum[6540].id }, amountGross: 13000, amountGrossCurrency: 13000,
        vatType: { id: 0 }, description: "6540 WITHOUT VAT (error)" },
      { row: 2, account: { id: acctByNum[7300].id }, amountGross: 1500, amountGrossCurrency: 1500,
        vatType: { id: acctByNum[7300].vatTypeId }, description: "7300 with VAT (generates 2710)" },
      { row: 3, account: { id: contraAcct }, amountGross: -14500, amountGrossCurrency: -14500,
        description: "Contra 1500" },
    ],
  });
  if (vB) {
    console.log(`  Created id=${vB.value.id}`);
    for (const p of vB.value.postings) {
      console.log(`    acct=${p.account?.number ?? acctById[p.account?.id]}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  if (!vA || !vB) { console.log("Could not create test vouchers"); return; }

  // Step 4: Fetch and test detection
  console.log("\n=== Fetching vouchers and testing detection ===");
  const testIds = [vA.value.id, vB.value.id];
  const vRes = await api("GET",
    `/ledger/voucher?dateFrom=2026-03-01&dateTo=2026-04-01&fields=id,number,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),description)&count=1000`
  );
  if (!vRes) return;

  const MV_ACCT = 6540;
  const getAcctNumber = (p: any) => p.account?.number ?? acctById[p.account?.id];
  const has2710 = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === 2710);
  const onMvAcct = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === MV_ACCT);

  // Filter to only our test vouchers
  const testVouchers = vRes.values.filter((v: any) => testIds.includes(v.id));
  console.log(`\nTest vouchers found: ${testVouchers.length}`);

  for (const v of testVouchers) {
    const mvP = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    const h2710 = has2710(v);
    console.log(`\n  Voucher ${v.id} "${v.description}":`);
    console.log(`    has2710 (voucher-level) = ${h2710}`);
    console.log(`    mvPosting.vatType.id = ${mvP?.vatType?.id}`);
    for (const p of v.postings) {
      console.log(`      acct=${getAcctNumber(p)}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
    }
  }

  // OLD detection
  const oldCaseA = testVouchers.filter((v: any) => onMvAcct(v) && !has2710(v));
  const oldCaseB = testVouchers.filter((v: any) => onMvAcct(v) && has2710(v));
  console.log(`\nOLD method: CaseA(no2710)=${oldCaseA.length}, CaseB(has2710)=${oldCaseB.length}`);
  if (oldCaseA.length > 0) console.log(`  OLD picks: ${oldCaseA.map((v:any) => v.id).join(", ")}`);
  else console.log(`  OLD falls back to CaseB[0]: ${oldCaseB[0]?.id}`);

  // NEW detection: posting-level vatType
  const newCaseA = testVouchers.filter((v: any) => {
    const mvP = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    return mvP && (mvP.vatType?.id === 0 || !mvP.vatType?.id);
  });
  const newCaseB = testVouchers.filter((v: any) => {
    const mvP = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    return mvP && mvP.vatType?.id && mvP.vatType.id !== 0;
  });
  console.log(`\nNEW method: CaseA(vatType=0)=${newCaseA.length}, CaseB(vatType≠0)=${newCaseB.length}`);
  if (newCaseA.length > 0) console.log(`  NEW picks: ${newCaseA.map((v:any) => v.id).join(", ")}`);

  // Verify
  const correctAnswer = vB.value.id; // Voucher B is the error
  console.log(`\nExpected error voucher: ${correctAnswer}`);
  console.log(`OLD method selects: ${oldCaseA.length > 0 ? oldCaseA[0].id : oldCaseB[0]?.id} → ${(oldCaseA.length > 0 ? oldCaseA[0].id : oldCaseB[0]?.id) === correctAnswer ? "CORRECT" : "WRONG"}`);
  console.log(`NEW method selects: ${newCaseA.length > 0 ? newCaseA[0].id : "none"} → ${newCaseA.length > 0 && newCaseA[0].id === correctAnswer ? "CORRECT" : "WRONG"}`);

  // Step 5: Cleanup
  console.log("\n=== Cleanup ===");
  for (const id of testIds) {
    const d = await api("DELETE", `/ledger/voucher/${id}`);
    console.log(`  Deleted ${id}: ${d !== null ? "OK" : "FAILED"}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
