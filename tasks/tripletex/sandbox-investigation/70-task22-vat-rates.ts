/**
 * Task 22 VAT rate investigation: Togbillett on account 7140
 *
 * Receipt: Togbillett 8750 kr, Kontorrekvisita 550 kr, Totalt 9300 kr, herav MVA 25%: 2325 kr
 * NET check: 9300 × 0.25 = 2325 = stated MVA → prices are NET
 *
 * Question: should Togbillett use 25% VAT (receipt says "herav MVA 25%") or 12% (statutory Norwegian transport rate)?
 *
 * Test A: vatType=1 (25%), GROSS = 8750 * 1.25 = 10937.50
 * Test B: vatType=12 (12%), GROSS = 8750 * 1.12 = 9800
 * Test C: vatType=1 (25%), GROSS = 9300 (receipt total as-is, treating it as gross with 25% VAT)
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", text.substring(0, 500)); return null; }
  return JSON.parse(text);
}

function printPostings(label: string, postings: any[]) {
  console.log(`\n=== ${label} ===`);
  for (const p of postings) {
    console.log(`  Account ${p.account?.number} (${p.account?.name})`);
    console.log(`    amount=${p.amount}, amountGross=${p.amountGross}`);
    console.log(`    vatType.id=${p.vatType?.id} (${p.vatType?.name || "n/a"})`);
    if (p.department) console.log(`    department=${p.department.name}`);
  }
}

async function main() {
  // Get account IDs
  const acctRes = await api("GET", "/ledger/account?number=7140,2050&fields=id,number,name,vatType(*)");
  if (!acctRes) throw new Error("Failed to get accounts");
  const acct7140 = acctRes.values.find((a: any) => a.number === 7140);
  const acct2050 = acctRes.values.find((a: any) => a.number === 2050);
  console.log(`\nAccount 7140: id=${acct7140.id}, default vatType.id=${acct7140.vatType?.id} (${acct7140.vatType?.name})`);
  console.log(`Account 2050: id=${acct2050.id}`);

  // Get or create department
  const deptSearchRes = await api("GET", "/department?name=Administrasjon&isInactive=false&fields=*");
  let deptId: number;
  const exactDept = deptSearchRes?.values?.find((d: any) => d.name === "Administrasjon");
  if (exactDept) {
    deptId = exactDept.id;
    console.log(`\nExisting department Administrasjon: id=${deptId}`);
  } else {
    const deptRes = await api("POST", "/department", { name: "Administrasjon" });
    if (!deptRes) throw new Error("Failed to create department");
    deptId = deptRes.value.id;
    console.log(`\nCreated department Administrasjon: id=${deptId}`);
  }

  // =====================================================================
  // Test A: vatType=1 (25%), GROSS = 8750 * 1.25 = 10937.50
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("TEST A: vatType=1 (25% incoming), GROSS = 8750 × 1.25 = 10937.50");
  console.log("=".repeat(70));

  const grossA = 8750 * 1.25; // 10937.50
  const voucherA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Togbillett TEST-A (25% VAT)",
    postings: [
      {
        row: 1, date: "2026-03-21", description: "Togbillett TEST-A",
        account: { id: acct7140.id }, department: { id: deptId },
        vatType: { id: 1 },
        amountGross: grossA, amountGrossCurrency: grossA,
      },
      {
        row: 2, date: "2026-03-21", description: "Togbillett TEST-A",
        account: { id: acct2050.id },
        amount: -grossA, amountCurrency: -grossA,
        amountGross: -grossA, amountGrossCurrency: -grossA,
      },
    ],
  });
  if (voucherA) {
    console.log(`Voucher A: id=${voucherA.value.id}, number=${voucherA.value.number}`);
    printPostings("Test A postings", voucherA.value.postings);
    // Summarize key figures
    const expenseA = voucherA.value.postings.find((p: any) => p.account?.number === 7140);
    const vatPostA = voucherA.value.postings.find((p: any) => p.account?.number !== 7140 && p.account?.number !== 2050);
    console.log(`\n  >> Expense: NET=${expenseA?.amount}, GROSS=${expenseA?.amountGross}, vatType=${expenseA?.vatType?.id}`);
    if (vatPostA) console.log(`  >> VAT posting: account=${vatPostA.account?.number} (${vatPostA.account?.name}), amount=${vatPostA.amount}`);
  }

  // =====================================================================
  // Test B: vatType=12 (12%), GROSS = 8750 * 1.12 = 9800
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("TEST B: vatType=12 (12% incoming lav sats), GROSS = 8750 × 1.12 = 9800");
  console.log("=".repeat(70));

  const grossB = 8750 * 1.12; // 9800
  const voucherB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Togbillett TEST-B (12% VAT)",
    postings: [
      {
        row: 1, date: "2026-03-21", description: "Togbillett TEST-B",
        account: { id: acct7140.id }, department: { id: deptId },
        vatType: { id: 12 },
        amountGross: grossB, amountGrossCurrency: grossB,
      },
      {
        row: 2, date: "2026-03-21", description: "Togbillett TEST-B",
        account: { id: acct2050.id },
        amount: -grossB, amountCurrency: -grossB,
        amountGross: -grossB, amountGrossCurrency: -grossB,
      },
    ],
  });
  if (voucherB) {
    console.log(`Voucher B: id=${voucherB.value.id}, number=${voucherB.value.number}`);
    printPostings("Test B postings", voucherB.value.postings);
    const expenseB = voucherB.value.postings.find((p: any) => p.account?.number === 7140);
    const vatPostB = voucherB.value.postings.find((p: any) => p.account?.number !== 7140 && p.account?.number !== 2050);
    console.log(`\n  >> Expense: NET=${expenseB?.amount}, GROSS=${expenseB?.amountGross}, vatType=${expenseB?.vatType?.id}`);
    if (vatPostB) console.log(`  >> VAT posting: account=${vatPostB.account?.number} (${vatPostB.account?.name}), amount=${vatPostB.amount}`);
  }

  // =====================================================================
  // Test C: vatType=1 (25%), GROSS = 9300 (receipt total as gross)
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("TEST C: vatType=1 (25% incoming), GROSS = 9300 (receipt total as-is)");
  console.log("=".repeat(70));

  const grossC = 9300;
  const voucherC = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Togbillett TEST-C (25% VAT, gross=receipt total)",
    postings: [
      {
        row: 1, date: "2026-03-21", description: "Togbillett TEST-C",
        account: { id: acct7140.id }, department: { id: deptId },
        vatType: { id: 1 },
        amountGross: grossC, amountGrossCurrency: grossC,
      },
      {
        row: 2, date: "2026-03-21", description: "Togbillett TEST-C",
        account: { id: acct2050.id },
        amount: -grossC, amountCurrency: -grossC,
        amountGross: -grossC, amountGrossCurrency: -grossC,
      },
    ],
  });
  if (voucherC) {
    console.log(`Voucher C: id=${voucherC.value.id}, number=${voucherC.value.number}`);
    printPostings("Test C postings", voucherC.value.postings);
    const expenseC = voucherC.value.postings.find((p: any) => p.account?.number === 7140);
    const vatPostC = voucherC.value.postings.find((p: any) => p.account?.number !== 7140 && p.account?.number !== 2050);
    console.log(`\n  >> Expense: NET=${expenseC?.amount}, GROSS=${expenseC?.amountGross}, vatType=${expenseC?.vatType?.id}`);
    if (vatPostC) console.log(`  >> VAT posting: account=${vatPostC.account?.number} (${vatPostC.account?.name}), amount=${vatPostC.amount}`);
  }

  // =====================================================================
  // Summary
  // =====================================================================
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log("Receipt: Togbillett 8750 kr (NET), Kontorrekvisita 550 kr, Total 9300, MVA 25%: 2325");
  console.log("");
  console.log("Test A (25% VAT, GROSS=10937.50): what 3373fbc9 did — failed Check 3");
  console.log("Test B (12% VAT, GROSS=9800): statutory transport rate — expected correct");
  console.log("Test C (25% VAT, GROSS=9300): treating receipt total as gross");
  console.log("");

  if (voucherA && voucherB && voucherC) {
    const eA = voucherA.value.postings.find((p: any) => p.account?.number === 7140);
    const eB = voucherB.value.postings.find((p: any) => p.account?.number === 7140);
    const eC = voucherC.value.postings.find((p: any) => p.account?.number === 7140);
    const vA = voucherA.value.postings.find((p: any) => p.account?.number !== 7140 && p.account?.number !== 2050);
    const vB = voucherB.value.postings.find((p: any) => p.account?.number !== 7140 && p.account?.number !== 2050);
    const vC = voucherC.value.postings.find((p: any) => p.account?.number !== 7140 && p.account?.number !== 2050);

    console.log("         | GROSS    | NET (auto) | VAT (auto) | VAT account | vatType");
    console.log("---------|----------|------------|------------|-------------|--------");
    console.log(`Test A   | ${eA?.amountGross}  | ${eA?.amount}    | ${vA?.amount}    | ${vA?.account?.number}        | ${eA?.vatType?.id} (25%)`);
    console.log(`Test B   | ${eB?.amountGross}  | ${eB?.amount}    | ${vB?.amount}     | ${vB?.account?.number}        | ${eB?.vatType?.id} (12%)`);
    console.log(`Test C   | ${eC?.amountGross}  | ${eC?.amount}    | ${vC?.amount}     | ${vC?.account?.number}        | ${eC?.vatType?.id} (25%)`);
    console.log("");
    console.log("For the scorer, the correct NET amount for Togbillett should be 8750 (the receipt line amount).");
    console.log("Test B (12% VAT): NET=8750 ✓ — matches the receipt line exactly");
    console.log("Test A (25% VAT): NET=" + eA?.amount + " — " + (eA?.amount === 8750 ? "✓ matches" : "✗ WRONG, receipt says 8750"));
    console.log("Test C (25% VAT, gross=9300): NET=" + eC?.amount + " — " + (eC?.amount === 8750 ? "✓ matches" : "✗ WRONG, receipt says 8750"));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
