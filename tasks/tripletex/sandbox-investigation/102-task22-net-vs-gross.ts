/**
 * Task 22: NET vs GROSS definitive test
 *
 * Math proof prices are NET:
 *   Receipt: Total=9300, MVA=2325. 9300×0.25=2325 ✓ (NET×25%=MVA)
 *   If GROSS: 9300/1.25×0.25 = 1860 ≠ 2325
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: H,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  if (r.status >= 400) console.log(`  ERR ${method} ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { ok: r.ok, status: r.status, data };
}

// Use existing departments
const DEPT_IDS: Record<string, number> = {
  "Drift": 927069,
  "Administrasjon": 984875,
  "Utvikling": 984876,
  "HR": 985581,
};

interface TestResult {
  interp: string;
  amountGross: number;
  autoNetAmount: number | null;
  receiptLine: number;
  netMatch: boolean;
  vatTypeId: number | null;
  autoVatAmount: number | null;
  autoVatAcct: number | null;
}

async function testBranch(opts: {
  branch: string;
  receiptLine: string;
  receiptLinePrice: number;
  accountNumber: number;
  vatRate: number;
  deptName: string;
}): Promise<TestResult[]> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${opts.branch}: ${opts.receiptLine} = ${opts.receiptLinePrice} kr, account ${opts.accountNumber}, VAT ${opts.vatRate * 100}%`);
  console.log("=".repeat(60));

  // Get account
  // Use 2050 instead of 1920 because 1920 has reconciled periods in sandbox
  const acctR = await api("GET", `/ledger/account?number=${opts.accountNumber},2050&fields=id,number,name,vatType(*),vatLocked`);
  const acct = acctR.data.values.find((a: any) => a.number === opts.accountNumber);
  const bank = acctR.data.values.find((a: any) => a.number === 2050);
  const deptId = DEPT_IDS[opts.deptName];
  console.log(`  acct ${acct.number}: id=${acct.id} vatLocked=${acct.vatLocked} vatType.id=${acct.vatType?.id}`);

  const results: TestResult[] = [];
  const grossValues: [string, number][] = [];

  if (opts.vatRate === 0.25) {
    grossValues.push(["NET×1.25", opts.receiptLinePrice * 1.25]);
    grossValues.push(["DIRECT", opts.receiptLinePrice]);
  } else if (opts.vatRate === 0.12) {
    grossValues.push(["NET×1.12", opts.receiptLinePrice * 1.12]);
    grossValues.push(["NET×1.25", opts.receiptLinePrice * 1.25]);
    grossValues.push(["DIRECT", opts.receiptLinePrice]);
  } else {
    grossValues.push(["DIRECT", opts.receiptLinePrice]);
  }

  for (const [interp, amtGross] of grossValues) {
    // Round to avoid floating point
    const roundedGross = Math.round(amtGross * 100) / 100;
    console.log(`\n  --- ${interp}: amountGross = ${roundedGross} ---`);

    const expPosting: any = {
      row: 1, date: "2026-06-15", description: `${opts.receiptLine} ${interp}`,
      account: { id: acct.id }, department: { id: deptId },
      amountGross: roundedGross, amountGrossCurrency: roundedGross,
    };

    if (acct.vatLocked) {
      expPosting.amount = roundedGross;
      expPosting.amountCurrency = roundedGross;
    } else if (acct.vatType?.id) {
      expPosting.vatType = { id: acct.vatType.id };
    }

    const bankPosting: any = {
      row: 2, date: "2026-06-15", description: `${opts.receiptLine} ${interp}`,
      account: { id: bank.id },
      amountGross: -roundedGross, amountGrossCurrency: -roundedGross,
    };
    if (acct.vatLocked) {
      bankPosting.amount = -roundedGross;
      bankPosting.amountCurrency = -roundedGross;
    }

    const v = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2026-06-15", description: `${opts.receiptLine} ${interp}`,
      postings: [expPosting, bankPosting],
    });

    if (!v.ok) {
      results.push({ interp, amountGross: roundedGross, autoNetAmount: null, receiptLine: opts.receiptLinePrice, netMatch: false, vatTypeId: null, autoVatAmount: null, autoVatAcct: null });
      continue;
    }

    const vid = v.data.value.id;
    const rb = await api("GET", `/ledger/voucher/${vid}?fields=id,number,postings(row,amount,amountGross,account(number,name),department(name),vatType(id,percentage),systemGenerated)`);
    const vv = rb.data.value;

    for (const p of (vv.postings || [])) {
      const sys = p.systemGenerated ? " [AUTO]" : "";
      console.log(`    row=${p.row} acct=${p.account?.number} amount=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || '-'}${sys}`);
    }

    const exp = vv.postings.find((p: any) => p.row === 1 && !p.systemGenerated);
    const autoVat = vv.postings.find((p: any) => p.systemGenerated);
    const netMatch = Math.abs((exp?.amount || 0) - opts.receiptLinePrice) < 0.01;

    console.log(`  >> NET(auto)=${exp?.amount} vs receipt=${opts.receiptLinePrice} → ${netMatch ? "✓ MATCH" : "✗ NO MATCH"}`);

    results.push({
      interp, amountGross: roundedGross,
      autoNetAmount: exp?.amount, receiptLine: opts.receiptLinePrice,
      netMatch, vatTypeId: exp?.vatType?.id,
      autoVatAmount: autoVat?.amount || null, autoVatAcct: autoVat?.account?.number || null,
    });
  }

  return results;
}

async function main() {
  const allResults: Record<string, TestResult[]> = {};

  allResults["B-Whiteboard"] = await testBranch({
    branch: "BRANCH B", receiptLine: "Whiteboard", receiptLinePrice: 14300,
    accountNumber: 6540, vatRate: 0.25, deptName: "HR",
  });

  allResults["C-Togbillett"] = await testBranch({
    branch: "BRANCH C", receiptLine: "Togbillett", receiptLinePrice: 8750,
    accountNumber: 7140, vatRate: 0.12, deptName: "Administrasjon",
  });

  allResults["A-Forretningslunsj"] = await testBranch({
    branch: "BRANCH A", receiptLine: "Forretningslunsj", receiptLinePrice: 13650,
    accountNumber: 7360, vatRate: 0.25, deptName: "Drift",
  });

  allResults["D-Kaffemote"] = await testBranch({
    branch: "BRANCH D", receiptLine: "Kaffemøte", receiptLinePrice: 6600,
    accountNumber: 6860, vatRate: 0.25, deptName: "Utvikling",
  });

  // ============================================================
  console.log("\n\n" + "=".repeat(60));
  console.log("DEFINITIVE RESULTS");
  console.log("=".repeat(60));

  for (const [branch, results] of Object.entries(allResults)) {
    console.log(`\n${branch}:`);
    for (const r of results) {
      const star = r.netMatch ? "  ★★★ NET MATCHES RECEIPT LINE" : "";
      console.log(`  ${r.interp}: gross=${r.amountGross} → NET(auto)=${r.autoNetAmount} vs receipt=${r.receiptLine} ${r.netMatch ? "✓" : "✗"}${star}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("CONCLUSION");
  console.log("=".repeat(60));
  console.log(`
If NET interpretation is correct (amountGross = receiptLine × (1+rate)):
  - Tripletex auto-computes amount = amountGross / (1+rate) = original receipt line
  - This means the scorer can verify: amount == receipt line price

If GROSS interpretation is correct (amountGross = receiptLine directly):
  - Tripletex auto-computes amount = amountGross / (1+rate) = lower than receipt line
  - The scorer would need to verify amountGross == receipt line price

The scorer likely checks amountGross, since that's the directly observable field.
Production evidence:
  - Run 3373fbc9: amountGross=10937.50 (8750×1.25), vatType=1 → Check 3 FAILED
  - This rules out NET×1.25 with vatType=1 for Togbillett
  - But doesn't tell us if NET×1.12 or DIRECT(8750) is correct
  `);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
