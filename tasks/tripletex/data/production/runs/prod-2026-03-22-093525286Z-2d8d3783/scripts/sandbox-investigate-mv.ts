// Sandbox investigation: understand missing-VAT detection failure
// Production run: caseA(no2710)=0, caseB(has2710)=3 — all vouchers on 6540 had 2710 postings
// Hypothesis: the error voucher has 6540 with vatType=0 BUT another line generates a 2710 posting

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
  if (!res.ok) { console.error(`HTTP ${res.status} ${method} ${path}: ${text.substring(0, 300)}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // Step 1: Get account IDs for 6540, 2710, and a couple other accounts
  const acctRes = await api("GET", "/ledger/account?number=6540,2710,2400,1920,7300&fields=id,number,name,vatType(id)");
  if (!acctRes) return;
  console.log("Accounts:");
  const acctById: Record<number, number> = {};
  const acctByNum: Record<number, { id: number; vatTypeId: number }> = {};
  for (const a of acctRes.values) {
    console.log(`  ${a.number} (id=${a.id}): name="${a.name}", vatType=${a.vatType?.id ?? "none"}`);
    acctById[a.id] = a.number;
    acctByNum[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
  }

  // Step 2: Create two test vouchers to prove the hypothesis
  // Voucher A (correct): 6540 with vatType=1 → auto-generates 2710 posting
  console.log("\n=== Creating Voucher A (correct, 6540 with vatType=1) ===");
  const vA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-01-15",
    description: "Test correct booking (with VAT)",
    postings: [
      { row: 1, account: { id: acctByNum[6540].id }, amountGross: 13000, amountGrossCurrency: 13000,
        vatType: { id: acctByNum[6540].vatTypeId }, description: "6540 with VAT" },
      { row: 2, account: { id: acctByNum[1920].id }, amountGross: -13000, amountGrossCurrency: -13000,
        description: "Contra" },
    ],
  });
  if (vA) {
    console.log(`  Created voucher ${vA.value.id}, postings:`);
    for (const p of vA.value.postings || []) {
      console.log(`    acct=${p.account?.number ?? acctById[p.account?.id]}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  // Voucher B (error): 6540 with vatType=0 (no VAT) + 7300 with vatType=1 (has VAT, generates 2710)
  console.log("\n=== Creating Voucher B (error: 6540 vatType=0, but 7300 vatType=1 generates 2710) ===");
  const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-01-20",
    description: "Test missing VAT booking",
    postings: [
      { row: 1, account: { id: acctByNum[6540].id }, amountGross: 13000, amountGrossCurrency: 13000,
        vatType: { id: 0 }, description: "6540 WITHOUT VAT (error)" },
      { row: 2, account: { id: acctByNum[7300].id }, amountGross: 1500, amountGrossCurrency: 1500,
        vatType: { id: acctByNum[7300].vatTypeId }, description: "7300 with VAT (generates 2710)" },
      { row: 3, account: { id: acctByNum[1920].id }, amountGross: -14500, amountGrossCurrency: -14500,
        description: "Contra" },
    ],
  });
  if (vB) {
    console.log(`  Created voucher ${vB.value.id}, postings:`);
    for (const p of vB.value.postings || []) {
      console.log(`    acct=${p.account?.number ?? acctById[p.account?.id]}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  // Step 3: Fetch both vouchers and test detection logic
  console.log("\n=== Testing detection logic ===");
  const voucherIds = [vA?.value?.id, vB?.value?.id].filter(Boolean);
  if (voucherIds.length < 2) {
    console.log("Could not create both vouchers, aborting detection test");
    return;
  }

  const fetchRes = await api("GET",
    `/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-02-01&fields=id,number,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),description)&count=1000`
  );
  if (!fetchRes) return;

  const MV_ACCT = 6540;
  const getAcctNumber = (p: any) => p.account?.number ?? acctById[p.account?.id];
  const has2710 = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === 2710);
  const onMvAcct = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === MV_ACCT);

  const allMv = fetchRes.values.filter(onMvAcct);
  console.log(`\nTotal vouchers on ${MV_ACCT}: ${allMv.length}`);

  // OLD method: voucher-level has2710
  const oldCaseA = allMv.filter((v: any) => !has2710(v));
  const oldCaseB = allMv.filter((v: any) => has2710(v));
  console.log(`\nOLD method (voucher-level has2710):`);
  console.log(`  Case A (no 2710): ${oldCaseA.length} vouchers`);
  console.log(`  Case B (has 2710): ${oldCaseB.length} vouchers`);

  // NEW method: posting-level vatType on MV_ACCT posting
  const newCaseA = allMv.filter((v: any) => {
    const mvPosting = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    return mvPosting && (mvPosting.vatType?.id === 0 || !mvPosting.vatType?.id);
  });
  const newCaseB = allMv.filter((v: any) => {
    const mvPosting = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    return mvPosting && mvPosting.vatType?.id && mvPosting.vatType.id !== 0;
  });
  console.log(`\nNEW method (posting-level vatType):`);
  console.log(`  Case A (vatType=0 on MV_ACCT): ${newCaseA.length} vouchers`);
  console.log(`  Case B (vatType≠0 on MV_ACCT): ${newCaseB.length} vouchers`);

  // Show details
  for (const v of allMv) {
    const mvP = v.postings.find((p: any) => getAcctNumber(p) === MV_ACCT);
    const h2710 = has2710(v);
    console.log(`\n  Voucher ${v.id} "${v.description}":`);
    console.log(`    has2710=${h2710}, mvPosting.vatType=${mvP?.vatType?.id}`);
    for (const p of v.postings) {
      console.log(`    acct=${getAcctNumber(p)}, gross=${p.amountGross}, vatType=${p.vatType?.id}`);
    }
  }

  // Step 4: Clean up test vouchers
  console.log("\n=== Cleanup ===");
  for (const id of voucherIds) {
    const delRes = await api("DELETE", `/ledger/voucher/${id}`);
    console.log(`  Deleted voucher ${id}: ${delRes !== null ? "OK" : "FAILED"}`);
  }

  console.log("\n=== Conclusion ===");
  console.log("If OLD method puts Voucher B in Case B (has 2710) but NEW method puts it in Case A (vatType=0),");
  console.log("then the posting-level detection is strictly better.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
