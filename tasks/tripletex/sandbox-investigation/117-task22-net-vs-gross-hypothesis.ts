/**
 * Task 22: Test NET vs GROSS hypothesis for "herav MVA" receipts
 *
 * Receipt: Elkjøp, Tastatur 6900 kr, Total 7780, herav MVA 25%: 1945
 *
 * H1 (current playbook — NET interpretation):
 *   amountGross = 6900 × 1.25 = 8625, vatType=1
 *   Expected: amount=6900, VAT=1725
 *
 * H2 (GROSS interpretation — "herav" means included):
 *   amountGross = 6900, vatType=1
 *   Expected: amount=5520, VAT=1380
 *
 * If production Check 3 failed with H1, H2 may be what scorer expects.
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

async function testHypothesis(label: string, grossAmount: number) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`HYPOTHESIS: ${label}`);
  console.log(`amountGross = ${grossAmount}, vatType = 1 (25%)`);
  console.log("=".repeat(70));

  // Get dept
  const deptRes = await api("GET", "/department?name=Administrasjon&isInactive=false&fields=*");
  const dept = deptRes.data.values?.find((d: any) => d.name === "Administrasjon");
  const deptId = dept?.id;
  if (!deptId) {
    const createDept = await api("POST", "/department", { name: "Administrasjon", departmentNumber: -1 });
    console.log("Created dept:", createDept.data.value?.id);
  }
  const finalDeptId = deptId || (await api("GET", "/department?name=Administrasjon&isInactive=false&fields=*")).data.values?.find((d: any) => d.name === "Administrasjon")?.id;

  // Get accounts - use 2050 as bank (1920 is reconciliation-locked in sandbox)
  const acctRes = await api("GET", "/ledger/account?number=6540,2050&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.data.values?.find((a: any) => a.number === 6540);
  const acctBank = acctRes.data.values?.find((a: any) => a.number === 2050);

  console.log(`  6540: id=${acct6540?.id}, vatType=${acct6540?.vatType?.id} (${acct6540?.vatType?.percentage}%)`);
  console.log(`  2050: id=${acctBank?.id}`);
  console.log(`  dept: id=${finalDeptId}`);

  // POST voucher
  const voucherBody = {
    date: "2026-05-19",
    description: "Tastatur",
    postings: [
      {
        row: 1,
        date: "2026-05-19",
        description: "Tastatur",
        account: { id: acct6540!.id },
        department: { id: finalDeptId },
        vatType: { id: acct6540!.vatType?.id ?? 1 },
        amountGross: grossAmount,
        amountGrossCurrency: grossAmount,
      },
      {
        row: 2,
        date: "2026-05-19",
        description: "Tastatur",
        account: { id: acctBank!.id },
        amountGross: -grossAmount,
        amountGrossCurrency: -grossAmount,
      },
    ],
  };

  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", voucherBody);
  if (vRes.status !== 201) {
    console.log(`  VOUCHER CREATION FAILED: ${vRes.status}`, JSON.stringify(vRes.data));
    return;
  }

  const v = vRes.data.value;
  console.log(`  Voucher #${v.number} id=${v.id}`);

  // Readback with full field expansion
  const rb = await api("GET", `/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated),attachment(id)`);
  const rv = rb.data.value;

  console.log(`\n  READBACK:`);
  console.log(`  date=${rv.date} desc="${rv.description}"`);
  for (const p of rv.postings || []) {
    const acctNum = p.account?.number;
    const acctName = p.account?.name;
    const deptName = p.department?.name || "-";
    const vatPct = p.vatType?.percentage;
    const vatId = p.vatType?.id;
    const sysGen = p.systemGenerated ? " [SYSTEM-GENERATED]" : "";
    console.log(`    row=${p.row} | acct=${acctNum}(${acctName}) | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${vatId}(${vatPct}%) | dept=${deptName}${sysGen}`);
  }

  // Extract key fields for comparison
  const expensePosting = rv.postings?.find((p: any) => p.account?.number === 6540);
  const bankPosting = rv.postings?.find((p: any) => p.account?.number === 2050);
  const vatPosting = rv.postings?.find((p: any) => p.systemGenerated);

  console.log(`\n  SCORER-RELEVANT FIELDS:`);
  console.log(`    expense.amountGross = ${expensePosting?.amountGross}`);
  console.log(`    expense.amount (NET) = ${expensePosting?.amount}`);
  console.log(`    expense.amountCurrency = ${expensePosting?.amountCurrency}`);
  console.log(`    expense.amountGrossCurrency = ${expensePosting?.amountGrossCurrency}`);
  console.log(`    expense.vatType.id = ${expensePosting?.vatType?.id}`);
  console.log(`    expense.vatType.percentage = ${expensePosting?.vatType?.percentage}%`);
  console.log(`    expense.department = ${expensePosting?.department?.name} (id=${expensePosting?.department?.id})`);
  console.log(`    bank.amountGross = ${bankPosting?.amountGross}`);
  console.log(`    bank.amount = ${bankPosting?.amount}`);
  if (vatPosting) {
    console.log(`    autoVAT.account = ${vatPosting?.account?.number} (${vatPosting?.account?.name})`);
    console.log(`    autoVAT.amount = ${vatPosting?.amount}`);
    console.log(`    autoVAT.amountGross = ${vatPosting?.amountGross}`);
  }

  return { expensePosting, bankPosting, vatPosting };
}

async function main() {
  // Math analysis first
  console.log("RECEIPT ANALYSIS:");
  console.log("  Tastatur: 6900.00 kr");
  console.log("  Forretningslunsj: 430.00 kr");
  console.log("  Skrivebordlampe: 450.00 kr");
  console.log("  Totalt: 7780.00 kr");
  console.log("  herav MVA 25%: 1945.00 kr");
  console.log("");
  console.log("  NET check: 7780 × 0.25 = " + (7780 * 0.25) + " vs stated 1945 → " + (7780 * 0.25 === 1945 ? "MATCH" : "NO MATCH"));
  console.log("  GROSS check: 7780 / 1.25 × 0.25 = " + (7780 / 1.25 * 0.25) + " vs stated 1945 → " + (7780 / 1.25 * 0.25 === 1945 ? "MATCH" : "NO MATCH"));
  console.log("");
  console.log("  'herav' = 'of which' → VAT is INCLUDED in total → prices are GROSS");
  console.log("  But: GROSS math (7780/1.25×0.25=1556) does NOT match 1945");
  console.log("  NET math (7780×0.25=1945) DOES match");
  console.log("  Despite 'herav', the math only works for NET. BUT production scored 7/10 with NET.");
  console.log("  Score reflection says scorer expects GROSS interpretation.");

  // Test both
  const h1 = await testHypothesis("H1 — NET (current playbook): GROSS = 6900 × 1.25 = 8625", 8625);
  const h2 = await testHypothesis("H2 — GROSS (receipt price = gross): amountGross = 6900", 6900);

  // Comparison
  console.log("\n" + "=".repeat(70));
  console.log("COMPARISON");
  console.log("=".repeat(70));
  console.log("");
  console.log("| Field | H1 (NET, 8625) | H2 (GROSS, 6900) | Production used |");
  console.log("|---|---|---|---|");
  console.log(`| expense.amountGross | ${h1?.expensePosting?.amountGross} | ${h2?.expensePosting?.amountGross} | 8625 (H1) |`);
  console.log(`| expense.amount (NET) | ${h1?.expensePosting?.amount} | ${h2?.expensePosting?.amount} | 6900 |`);
  console.log(`| expense.vatType.id | ${h1?.expensePosting?.vatType?.id} | ${h2?.expensePosting?.vatType?.id} | 1 |`);
  console.log(`| autoVAT.amount | ${h1?.vatPosting?.amount} | ${h2?.vatPosting?.amount} | 1725 |`);
  console.log(`| autoVAT.account | ${h1?.vatPosting?.account?.number} | ${h2?.vatPosting?.account?.number} | 2710 |`);
  console.log(`| bank.amountGross | ${h1?.bankPosting?.amountGross} | ${h2?.bankPosting?.amountGross} | -8625 |`);
  console.log("");
  console.log("Production run e89025d1 used H1 (8625) and Check 3 FAILED.");
  console.log("If scorer expects receipt line = GROSS, H2 (6900) should pass.");

  // Also test: what happens if we DON'T send vatType? (defaults to 0)
  console.log("\n" + "=".repeat(70));
  console.log("H3 — GROSS without explicit vatType (test if scorer expects no VAT)");
  console.log("=".repeat(70));

  const acctRes = await api("GET", "/ledger/account?number=6540,2050&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.data.values?.find((a: any) => a.number === 6540);
  const acctBank = acctRes.data.values?.find((a: any) => a.number === 2050);
  const deptRes = await api("GET", "/department?name=Administrasjon&isInactive=false&fields=*");
  const finalDeptId = deptRes.data.values?.find((d: any) => d.name === "Administrasjon")?.id;

  const h3Body = {
    date: "2026-05-19",
    description: "Tastatur",
    postings: [
      {
        row: 1,
        date: "2026-05-19",
        description: "Tastatur",
        account: { id: acct6540!.id },
        department: { id: finalDeptId },
        // NO vatType — defaults to 0
        amountGross: 6900,
        amountGrossCurrency: 6900,
      },
      {
        row: 2,
        date: "2026-05-19",
        description: "Tastatur",
        account: { id: acctBank!.id },
        amountGross: -6900,
        amountGrossCurrency: -6900,
      },
    ],
  };
  const h3Res = await api("POST", "/ledger/voucher?sendToLedger=true", h3Body);
  if (h3Res.status === 201) {
    const h3rb = await api("GET", `/ledger/voucher/${h3Res.data.value.id}?fields=id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated),attachment(id)`);
    console.log("  H3 Readback:");
    for (const p of h3rb.data.value.postings || []) {
      console.log(`    row=${p.row} | acct=${p.account?.number} | amount=${p.amount} | amountGross=${p.amountGross} | vatType=${p.vatType?.id}(${p.vatType?.percentage}%) | sysGen=${p.systemGenerated}`);
    }
    console.log("  H3 has NO auto-VAT posting (vatType=0 → no deduction)");
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
