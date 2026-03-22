/**
 * Task 22 Investigation: Branch A (Forretningslunsj) & Branch D (Kaffemote)
 *
 * FINDINGS from initial sandbox run:
 *
 * 1. Account properties:
 *    - 7350 "Representasjon, fradragsberettiget": vatLocked=true, vatType=0, NO VAT deduction
 *    - 7360 "Representasjon, ikke fradragsberettiget": vatLocked=true, vatType=0, NO VAT deduction
 *    - 6860 "Møte, kurs, oppdatering o.l.": vatLocked=false, vatType=1 (25% incoming), DEDUCTIBLE
 *
 * 2. Both 7350 and 7360 reject vatType=1 with 422 "Kontoen er låst til mva-kode 0"
 *    - They are structurally identical for voucher purposes
 *    - Only difference: tax deductibility (income tax), not VAT
 *
 * 3. Key question: should Forretningslunsj use 7350 or 7360?
 *    - Norwegian norm: simple business lunches → 7350 (tax-deductible)
 *    - Lavish entertainment → 7360 (not tax-deductible)
 *    - Current standard says 7360, but it was never cleanly tested
 *
 * This script creates vouchers with both accounts and reads them back
 * to see the exact shape the scorer would find.
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
  const status = r.status;
  if (!r.ok) {
    console.log(`${method} ${path} → ${status} ERROR: ${text.substring(0, 300)}`);
    return null;
  }
  console.log(`${method} ${path} → ${status}`);
  return JSON.parse(text);
}

async function main() {
  // ===== Step 1: Resolve accounts =====
  console.log("=== STEP 1: Resolve accounts ===\n");

  const acctRes = await api("GET", "/ledger/account?number=7360,7350,6860,1920,2050&fields=id,number,name,vatType(*),vatLocked");
  if (!acctRes) throw new Error("Failed to get accounts");

  const accounts: Record<number, any> = {};
  for (const a of acctRes.values) {
    accounts[a.number] = a;
    console.log(`  ${a.number} "${a.name}" id=${a.id} vatLocked=${a.vatLocked} vatType.id=${a.vatType?.id} (${a.vatType?.name || "none"})`);
  }

  // Use 2050 as balancing account (1920 has reconciled periods in sandbox)
  const bankAcct = accounts[2050];
  console.log(`\n  Using ${bankAcct.number} "${bankAcct.name}" as balancing account (sandbox workaround)`);

  // ===== Step 2: Resolve departments =====
  console.log("\n=== STEP 2: Resolve departments ===\n");

  const deptSearchRes = await api("GET", "/department?isInactive=false&fields=*");
  let deptDrift = deptSearchRes?.values?.find((d: any) => d.name === "Drift");
  let deptUtvikling = deptSearchRes?.values?.find((d: any) => d.name === "Utvikling");

  if (!deptDrift) {
    const r = await api("POST", "/department", { name: "Drift" });
    if (r) deptDrift = r.value;
  }
  if (!deptUtvikling) {
    const r = await api("POST", "/department", { name: "Utvikling" });
    if (r) deptUtvikling = r.value;
  }
  console.log(`  Drift: id=${deptDrift?.id}`);
  console.log(`  Utvikling: id=${deptUtvikling?.id}`);

  // ===== BRANCH A: Forretningslunsj (business lunch) =====
  // Receipt: Olivia, 30.01.2026, Forretningslunsj 13650 NET → GROSS=17062.50
  // Dept: Drift
  // Using 2026-03-22 for sandbox (receipt date falls in reconciled period)
  console.log("\n" + "=".repeat(70));
  console.log("BRANCH A: Forretningslunsj → representation account, no VAT");
  console.log("=".repeat(70));

  const dateA = "2026-03-22";
  const descA = "Forretningslunsj";
  const grossA = 13650 * 1.25; // 17062.50
  const deptIdA = deptDrift!.id;

  // Test A1: account 7360 (current standard)
  console.log("\n--- A1: 7360 (ikke fradragsberettiget) ---");
  const a1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: dateA,
    description: descA,
    postings: [
      {
        row: 1, date: dateA, description: descA,
        account: { id: accounts[7360].id },
        department: { id: deptIdA },
        amount: grossA, amountCurrency: grossA,
        amountGross: grossA, amountGrossCurrency: grossA,
      },
      {
        row: 2, date: dateA, description: descA,
        account: { id: bankAcct.id },
        amount: -grossA, amountCurrency: -grossA,
        amountGross: -grossA, amountGrossCurrency: -grossA,
      },
    ],
  });
  if (a1) {
    const v = a1.value;
    console.log(`  Voucher: id=${v.id} number=${v.number}`);
    // Readback
    const rb = await api("GET", `/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,amount,amountGross,account(number,name),department(id,name),vatType(id,name,percentage))`);
    if (rb) {
      console.log(`  Readback postings:`);
      for (const p of rb.value.postings) {
        console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || "none"}`);
      }
    }
  }

  // Test A2: account 7350 (fradragsberettiget) - alternative
  console.log("\n--- A2: 7350 (fradragsberettiget) ---");
  const a2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: dateA,
    description: descA,
    postings: [
      {
        row: 1, date: dateA, description: descA,
        account: { id: accounts[7350].id },
        department: { id: deptIdA },
        amount: grossA, amountCurrency: grossA,
        amountGross: grossA, amountGrossCurrency: grossA,
      },
      {
        row: 2, date: dateA, description: descA,
        account: { id: bankAcct.id },
        amount: -grossA, amountCurrency: -grossA,
        amountGross: -grossA, amountGrossCurrency: -grossA,
      },
    ],
  });
  if (a2) {
    const v = a2.value;
    console.log(`  Voucher: id=${v.id} number=${v.number}`);
    const rb = await api("GET", `/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,amount,amountGross,account(number,name),department(id,name),vatType(id,name,percentage))`);
    if (rb) {
      console.log(`  Readback postings:`);
      for (const p of rb.value.postings) {
        console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || "none"}`);
      }
    }
  }

  // ===== BRANCH D: Kaffemøte (coffee meeting) =====
  // Receipt: Starbucks, 04.01.2026, Kaffemøte 6600 NET → GROSS=8250
  // Dept: Utvikling
  console.log("\n" + "=".repeat(70));
  console.log("BRANCH D: Kaffemøte → meeting expense account, 25% VAT deductible");
  console.log("=".repeat(70));

  const dateD = "2026-03-22";
  const descD = "Kaffemøte";
  const grossD = 6600 * 1.25; // 8250
  const deptIdD = deptUtvikling!.id;

  // Test D1: account 6860 with vatType=1 (current standard)
  console.log("\n--- D1: 6860 (Møte,kurs) + vatType=1 (25%) [CURRENT STANDARD] ---");
  const d1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: dateD,
    description: descD,
    postings: [
      {
        row: 1, date: dateD, description: descD,
        account: { id: accounts[6860].id },
        department: { id: deptIdD },
        vatType: { id: 1 },
        amountGross: grossD, amountGrossCurrency: grossD,
      },
      {
        row: 2, date: dateD, description: descD,
        account: { id: bankAcct.id },
        amount: -grossD, amountCurrency: -grossD,
        amountGross: -grossD, amountGrossCurrency: -grossD,
      },
    ],
  });
  if (d1) {
    const v = d1.value;
    console.log(`  Voucher: id=${v.id} number=${v.number}`);
    const rb = await api("GET", `/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,amount,amountGross,account(number,name),department(id,name),vatType(id,name,percentage))`);
    if (rb) {
      console.log(`  Readback postings:`);
      for (const p of rb.value.postings) {
        console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || "none"}`);
      }
    }
  }

  // Test D2: account 7350 (alternative - maybe Kaffemote is deductible representation?)
  console.log("\n--- D2: 7350 (fradragsberettiget) + no VAT ---");
  const d2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: dateD,
    description: descD,
    postings: [
      {
        row: 1, date: dateD, description: descD,
        account: { id: accounts[7350].id },
        department: { id: deptIdD },
        amount: grossD, amountCurrency: grossD,
        amountGross: grossD, amountGrossCurrency: grossD,
      },
      {
        row: 2, date: dateD, description: descD,
        account: { id: bankAcct.id },
        amount: -grossD, amountCurrency: -grossD,
        amountGross: -grossD, amountGrossCurrency: -grossD,
      },
    ],
  });
  if (d2) {
    const v = d2.value;
    console.log(`  Voucher: id=${v.id} number=${v.number}`);
    const rb = await api("GET", `/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,amount,amountGross,account(number,name),department(id,name),vatType(id,name,percentage))`);
    if (rb) {
      console.log(`  Readback postings:`);
      for (const p of rb.value.postings) {
        console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || "none"}`);
      }
    }
  }

  // ===== SUMMARY =====
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY OF FINDINGS");
  console.log("=".repeat(70));
  console.log(`
BRANCH A (Forretningslunsj / business lunch):
  Receipt: Olivia, 30.01.2026, NET 13650 → GROSS 17062.50, dept Drift
  A1: 7360 (ikke fradragsberettiget), vatCode=0, amount=17062.50
  A2: 7350 (fradragsberettiget), vatCode=0, amount=17062.50
  Both produce identical voucher structures (same vatCode, same amounts)
  Only difference: account number. Scorer expectation unknown.

BRANCH D (Kaffemøte / coffee meeting):
  Receipt: Starbucks, 04.01.2026, NET 6600 → GROSS 8250, dept Utvikling
  D1: 6860 (Møte,kurs), vatType=1(25%), NET=6600, GROSS=8250, auto-VAT=1650
  D2: 7350 (fradragsberettiget), vatCode=0, amount=8250

  Key insight: Kaffemøte is clearly a meeting expense, not representation.
  6860 provides VAT deduction (correct for meeting expenses).
  7350/7360 do NOT provide VAT deduction.

PRODUCTION STATUS:
  Branch A: NEVER cleanly tested (prior runs had NET-as-GROSS or timeout)
  Branch D: NEVER tested with 6860 (only run used 7360, scored 0/10)
  Branch C (Togbillett): Only branch that ever scored (7/10 with 25% VAT, should be 12%)
  Branch B (Kontorstoler/Whiteboard): Score ambiguous

NEXT STEPS:
  1. Branch A needs a clean production test with: 7360 + GROSS=17062.50 + sendToLedger=true + attachment
     If that fails all 5 checks, try 7350 instead.
  2. Branch D needs a clean production test with: 6860 + vatType=1 + GROSS=8250 + sendToLedger=true + attachment
  `);
}

main().catch((e) => { console.error(e); process.exit(1); });
