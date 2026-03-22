// Sandbox investigation: test posting-level vatType detection for missing-VAT
// Use 2900 as contra (no customer/supplier requirement)

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
  const acctRes = await api("GET", "/ledger/account?number=6540,2710,7300,2900&fields=id,number,name,vatType(id)");
  if (!acctRes) return;
  const acctByNum: Record<number, { id: number; vatTypeId: number }> = {};
  const acctById: Record<number, number> = {};
  for (const a of acctRes.values) {
    console.log(`  ${a.number} (id=${a.id}): vatType=${a.vatType?.id ?? "none"}`);
    acctByNum[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
    acctById[a.id] = a.number;
  }

  const contraId = acctByNum[2900].id;
  const createdIds: number[] = [];

  // Create Voucher A (correct): 6540 with vatType=1 (generates 2710)
  console.log("\n=== Voucher A: 6540 with vatType=1 (correct) ===");
  const vA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-15",
    description: "Test correct booking",
    postings: [
      { row: 1, account: { id: acctByNum[6540].id }, amountGross: 13000, amountGrossCurrency: 13000,
        vatType: { id: acctByNum[6540].vatTypeId }, description: "6540 with VAT" },
      { row: 2, account: { id: contraId }, amountGross: -13000, amountGrossCurrency: -13000,
        description: "Contra" },
    ],
  });
  if (vA) {
    createdIds.push(vA.value.id);
    console.log(`  Created id=${vA.value.id}`);
    for (const p of vA.value.postings) {
      console.log(`    acct=${p.account?.number ?? acctById[p.account?.id]}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  // Create Voucher B (error): 6540 with vatType=0, PLUS 7300 with vatType=1
  // The 7300 posting with vatType=1 generates a 2710 posting in the voucher
  // This makes the voucher-level `has2710` return TRUE even though 6540 has no VAT
  console.log("\n=== Voucher B: 6540 vatType=0 + 7300 vatType=1 (error, but has 2710 from 7300) ===");
  const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-20",
    description: "Test missing VAT booking",
    postings: [
      { row: 1, account: { id: acctByNum[6540].id }, amountGross: 13000, amountGrossCurrency: 13000,
        vatType: { id: 0 }, description: "6540 WITHOUT VAT" },
      { row: 2, account: { id: acctByNum[7300].id }, amountGross: 1500, amountGrossCurrency: 1500,
        vatType: { id: acctByNum[7300].vatTypeId }, description: "7300 with VAT" },
      { row: 3, account: { id: contraId }, amountGross: -14500, amountGrossCurrency: -14500,
        description: "Contra" },
    ],
  });
  if (vB) {
    createdIds.push(vB.value.id);
    console.log(`  Created id=${vB.value.id}`);
    for (const p of vB.value.postings) {
      console.log(`    acct=${p.account?.number ?? acctById[p.account?.id]}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  if (createdIds.length < 2) { console.log("Could not create both vouchers"); return; }

  // Fetch and test detection
  console.log("\n=== Testing detection methods ===");
  const vRes = await api("GET",
    `/ledger/voucher?dateFrom=2026-03-01&dateTo=2026-04-01&fields=id,number,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),description)&count=1000`
  );
  if (!vRes) return;

  const MV_ACCT = 6540;
  const getAcctNumber = (p: any) => p.account?.number ?? acctById[p.account?.id];
  const has2710 = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === 2710);
  const onMvAcct = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === MV_ACCT);

  const testVouchers = vRes.values.filter((v: any) => createdIds.includes(v.id));
  console.log(`Test vouchers: ${testVouchers.length}`);

  for (const v of testVouchers) {
    const mvP = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    console.log(`\n  Voucher ${v.id} "${v.description}":`);
    console.log(`    has2710=${has2710(v)}, mvPosting.vatType=${mvP?.vatType?.id}`);
    for (const p of v.postings) {
      console.log(`      acct=${getAcctNumber(p) ?? "?"}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  // OLD: voucher-level has2710
  const oldA = testVouchers.filter((v: any) => onMvAcct(v) && !has2710(v));
  const oldB = testVouchers.filter((v: any) => onMvAcct(v) && has2710(v));
  console.log(`\nOLD: CaseA=${oldA.length}, CaseB=${oldB.length}`);
  const oldPick = oldA.length > 0 ? oldA[0].id : oldB[0]?.id;
  console.log(`  OLD picks: ${oldPick} → ${oldPick === vB.value.id ? "CORRECT" : "WRONG (should be " + vB.value.id + ")"}`);

  // NEW: posting-level vatType
  const newA = testVouchers.filter((v: any) => {
    const mvP = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    return mvP && (mvP.vatType?.id === 0 || !mvP.vatType?.id);
  });
  console.log(`\nNEW: CaseA=${newA.length}`);
  const newPick = newA.length > 0 ? newA[0].id : null;
  console.log(`  NEW picks: ${newPick} → ${newPick === vB.value.id ? "CORRECT" : "WRONG"}`);

  // Cleanup
  console.log("\n=== Cleanup ===");
  for (const id of createdIds) {
    const d = await api("DELETE", `/ledger/voucher/${id}`);
    console.log(`  Delete ${id}: ${d !== null ? "OK" : "FAILED"}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
