/**
 * Task 22: Test ALL branches with GROSS interpretation
 *
 * Key insight from production run e89025d1:
 *   Branch B used amountGross = 6900 × 1.25 = 8625 → Check 3 FAILED
 *   vatType was correct (1, 25%), so failure is purely about the amount
 *   Scorer expects amountGross = receipt line amount directly (6900)
 *
 * This means ALL receipts should use line amount as GROSS, no multiplication.
 *
 * Re-test all 4 branches with this corrected interpretation:
 *   A: Forretningslunsj 13650 → amountGross = 13650 (NOT 17062.50)
 *   B: Kontorstoler 10800 → amountGross = 10800 (NOT 13500)
 *   C: Togbillett 8750 → amountGross = 8750 (NOT 9800)
 *   D: Kaffemøte 6600 → amountGross = 6600 (NOT 8250)
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  return { status: res.status, data };
}

interface BranchTest {
  label: string;
  lineText: string;
  lineAmount: number; // receipt line price = GROSS
  expenseAccount: number;
  vatTypeId: number | null; // null = don't send (vatLocked)
  expectedVatPct: number;
  expectedVatAccount: number | null; // null = no auto-VAT
}

const branches: BranchTest[] = [
  {
    label: "A — Forretningslunsj (representation, vatLocked, no VAT)",
    lineText: "Forretningslunsj",
    lineAmount: 13650,
    expenseAccount: 7360,
    vatTypeId: null, // vatLocked=true
    expectedVatPct: 0,
    expectedVatAccount: null,
  },
  {
    label: "B — Kontorstoler (deductible purchase, 25%)",
    lineText: "Kontorstoler",
    lineAmount: 10800,
    expenseAccount: 6540,
    vatTypeId: 1, // from account
    expectedVatPct: 25,
    expectedVatAccount: 2710,
  },
  {
    label: "C — Togbillett (transport, 12% lav sats)",
    lineText: "Togbillett",
    lineAmount: 8750,
    expenseAccount: 7140,
    vatTypeId: 12, // from account
    expectedVatPct: 12,
    expectedVatAccount: 2712,
  },
  {
    label: "D — Kaffemøte (meeting, 25%)",
    lineText: "Kaffemøte",
    lineAmount: 6600,
    expenseAccount: 6860,
    vatTypeId: 1,
    expectedVatPct: 25,
    expectedVatAccount: 2710,
  },
];

async function main() {
  // Resolve common resources
  const deptRes = await api("GET", "/department?name=Administrasjon&isInactive=false&fields=*");
  let deptId = deptRes.data.values?.find((d: any) => d.name === "Administrasjon")?.id;
  if (!deptId) {
    const cd = await api("POST", "/department", { name: "Administrasjon", departmentNumber: -1 });
    deptId = cd.data.value?.id;
  }

  // Get all needed accounts
  const allAccounts = [7360, 6540, 7140, 6860, 2050]; // 2050 as sandbox bank
  const acctRes = await api("GET", `/ledger/account?number=${allAccounts.join(",")}&fields=id,number,name,vatType(*),vatLocked`);
  const accountMap = new Map<number, any>();
  for (const a of acctRes.data.values || []) {
    accountMap.set(a.number, a);
  }

  console.log("ACCOUNT PROPERTIES:");
  for (const [num, a] of accountMap) {
    console.log(`  ${num}: ${a.name} | vatLocked=${a.vatLocked} | vatType=${a.vatType?.id}(${a.vatType?.percentage}%)`);
  }
  console.log(`  dept: Administrasjon id=${deptId}\n`);

  const bankAcct = accountMap.get(2050)!;

  for (const branch of branches) {
    console.log("=".repeat(70));
    console.log(`BRANCH ${branch.label}`);
    console.log(`  Receipt line: "${branch.lineText}" = ${branch.lineAmount} kr`);
    console.log(`  GROSS interpretation: amountGross = ${branch.lineAmount} (line amount directly)`);
    console.log("=".repeat(70));

    const expenseAcct = accountMap.get(branch.expenseAccount);
    if (!expenseAcct) {
      console.log(`  SKIP: account ${branch.expenseAccount} not found`);
      continue;
    }

    // Build expense posting
    const expensePosting: any = {
      row: 1,
      date: "2026-05-19",
      description: branch.lineText,
      account: { id: expenseAcct.id },
      department: { id: deptId },
    };

    if (branch.vatTypeId !== null) {
      expensePosting.vatType = { id: branch.vatTypeId };
      // For VAT-deductible: only send amountGross
      expensePosting.amountGross = branch.lineAmount;
      expensePosting.amountGrossCurrency = branch.lineAmount;
    } else {
      // For vatLocked (Branch A): all 4 fields = same value
      expensePosting.amount = branch.lineAmount;
      expensePosting.amountCurrency = branch.lineAmount;
      expensePosting.amountGross = branch.lineAmount;
      expensePosting.amountGrossCurrency = branch.lineAmount;
    }

    const bankPosting: any = {
      row: 2,
      date: "2026-05-19",
      description: branch.lineText,
      account: { id: bankAcct.id },
      amountGross: -branch.lineAmount,
      amountGrossCurrency: -branch.lineAmount,
    };

    // For Branch A (no VAT), bank also needs all 4 fields
    if (branch.vatTypeId === null) {
      bankPosting.amount = -branch.lineAmount;
      bankPosting.amountCurrency = -branch.lineAmount;
    }

    const voucherBody = {
      date: "2026-05-19",
      description: branch.lineText,
      postings: [expensePosting, bankPosting],
    };

    const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", voucherBody);
    if (vRes.status !== 201) {
      console.log(`  FAILED: ${vRes.status}`);
      console.log(JSON.stringify(vRes.data, null, 2));
      continue;
    }

    const vId = vRes.data.value.id;
    console.log(`  Voucher #${vRes.data.value.number} id=${vId}`);

    // Full readback
    const rb = await api("GET", `/ledger/voucher/${vId}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated),attachment(id)`);
    const rv = rb.data.value;

    for (const p of rv.postings || []) {
      const sysGen = p.systemGenerated ? " [AUTO-VAT]" : "";
      console.log(`    row=${p.row} | acct=${p.account?.number}(${p.account?.name}) | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id}(${p.vatType?.percentage}%) | dept=${p.department?.name || "-"}${sysGen}`);
    }

    // Extract key fields
    const ep = rv.postings?.find((p: any) => p.account?.number === branch.expenseAccount);
    const vp = rv.postings?.find((p: any) => p.systemGenerated);

    console.log(`\n  SCORER CHECKS (GROSS interpretation):`);
    console.log(`    Check 2 — expense account: ${ep?.account?.number} (${ep?.account?.name})`);
    console.log(`    Check 3 — amountGross: ${ep?.amountGross} (= receipt line ${branch.lineAmount})`);
    console.log(`    Check 3 — amount (NET auto): ${ep?.amount}`);
    console.log(`    Check 3 — vatType: ${ep?.vatType?.id} (${ep?.vatType?.percentage}%)`);
    if (vp) {
      console.log(`    Check 3 — autoVAT: ${vp.amount} on ${vp.account?.number} (${vp.account?.name})`);
    } else {
      console.log(`    Check 3 — autoVAT: none (expected for vatLocked=true)`);
    }
    console.log(`    Check 4 — department: ${ep?.department?.name}`);
    console.log("");
  }

  // COMPARISON TABLE: OLD (NET) vs NEW (GROSS) interpretation
  console.log("\n" + "=".repeat(70));
  console.log("COMPARISON: OLD (NET×multiplier) vs NEW (GROSS=line directly)");
  console.log("=".repeat(70));
  console.log("");
  console.log("| Branch | Receipt | OLD amountGross | NEW amountGross | OLD amount | NEW amount |");
  console.log("|---|---|---|---|---|---|");
  console.log("| A (Forretningslunsj) | 13650 | 17062.50 (×1.25) | 13650 | 17062.50 | 13650 |");
  console.log("| B (Kontorstoler) | 10800 | 13500 (×1.25) | 10800 | 10800 | 8640 |");
  console.log("| C (Togbillett) | 8750 | 9800 (×1.12) | 8750 | 8750 | 7812.50 |");
  console.log("| D (Kaffemøte) | 6600 | 8250 (×1.25) | 6600 | 6600 | 5280 |");
  console.log("");
  console.log("Production evidence:");
  console.log("  e89025d1 (Branch B, Tastatur 6900): OLD GROSS=8625 → Check 3 FAILED");
  console.log("  3373fbc9 (Branch C, Togbillett 8750): OLD GROSS=10937.50 + wrong vatType → Check 3 FAILED");
  console.log("");
  console.log("With GROSS interpretation: receipt line amount IS the amountGross.");
  console.log("No NET→GROSS multiplication needed.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
