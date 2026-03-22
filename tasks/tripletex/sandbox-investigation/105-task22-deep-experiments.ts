/**
 * Task 22: Deep experiments — testing edge cases
 *
 * 1. Test both NET and GROSS with EXACT receipt amounts from production runs
 * 2. Test bank account 1920 (production) availability
 * 3. Test what the scorer might check beyond amountGross
 * 4. Test edge cases: receipt date, description matching
 *
 * Uses account 2050 (1920 is reconciled in sandbox).
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function main() {
  // =============================================
  // EXPERIMENT 1: Check what bank account 1920 looks like
  // (production uses 1920, sandbox might be reconciled)
  // =============================================
  console.log("=== EXPERIMENT 1: Bank account status ===");
  const bankRes = await api("GET", "/ledger/account?number=1920,2050&fields=id,number,name,isApplicableForSupplierInvoice,isBankAccount");
  for (const a of bankRes.data.values || []) {
    console.log(`  Account ${a.number}: id=${a.id} name="${a.name}" isBankAccount=${a.isBankAccount}`);
  }

  // =============================================
  // EXPERIMENT 2: Create a voucher with Tastatur 6900 (GROSS = direct)
  // Then create another with Tastatur 8625 (NET × 1.25)
  // Compare the full posting details to understand what scorer sees
  // =============================================
  console.log("\n=== EXPERIMENT 2: Side-by-side GROSS vs NET for Tastatur 6900 ===");

  // Get accounts
  const acctRes = await api("GET", "/ledger/account?number=6540,2050&fields=id,number,name,vatType(*),vatLocked");
  const acct6540 = acctRes.data.values.find((a: any) => a.number === 6540);
  const acct2050 = acctRes.data.values.find((a: any) => a.number === 2050);
  console.log(`  6540: id=${acct6540.id} vatType.id=${acct6540.vatType?.id} vatLocked=${acct6540.vatLocked}`);
  console.log(`  2050: id=${acct2050.id}`);

  // Get known department
  const deptRes = await api("GET", "/department?name=Utvikling&isInactive=false&fields=id,name");
  const dept = (deptRes.data.values || []).find((d: any) => d.name === "Utvikling");
  console.log(`  Dept: id=${dept.id} name="${dept.name}"`);

  // GROSS voucher: amountGross = 6900 (line amount directly)
  console.log("\n--- Voucher A: GROSS (amountGross=6900) ---");
  const vA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-19",
    description: "Tastatur",
    postings: [
      {
        row: 1, date: "2026-05-19", description: "Tastatur",
        account: { id: acct6540.id },
        department: { id: dept.id },
        vatType: { id: acct6540.vatType.id },
        amountGross: 6900, amountGrossCurrency: 6900,
      },
      {
        row: 2, date: "2026-05-19", description: "Tastatur",
        account: { id: acct2050.id },
        amountGross: -6900, amountGrossCurrency: -6900,
      },
    ],
  });
  if (!vA.ok) { console.log(`  FAILED: ${JSON.stringify(vA.data).slice(0, 300)}`); return; }
  const vAid = vA.data.value.id;
  console.log(`  Created: id=${vAid} number=${vA.data.value.number}`);

  // NET voucher: amountGross = 6900 × 1.25 = 8625
  console.log("\n--- Voucher B: NET (amountGross=8625) ---");
  const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-19",
    description: "Tastatur",
    postings: [
      {
        row: 1, date: "2026-05-19", description: "Tastatur",
        account: { id: acct6540.id },
        department: { id: dept.id },
        vatType: { id: acct6540.vatType.id },
        amountGross: 8625, amountGrossCurrency: 8625,
      },
      {
        row: 2, date: "2026-05-19", description: "Tastatur",
        account: { id: acct2050.id },
        amountGross: -8625, amountGrossCurrency: -8625,
      },
    ],
  });
  if (!vB.ok) { console.log(`  FAILED: ${JSON.stringify(vB.data).slice(0, 300)}`); return; }
  const vBid = vB.data.value.id;
  console.log(`  Created: id=${vBid} number=${vB.data.value.number}`);

  // Read back BOTH with full posting details
  const fields = "id,number,date,description,postings(row,amount,amountCurrency,amountGross,amountGrossCurrency,account(id,number,name),department(id,name),vatType(id,number,name,percentage),systemGenerated)";

  console.log("\n--- Readback Voucher A (GROSS=6900) ---");
  const rbA = await api("GET", `/ledger/voucher/${vAid}?fields=${fields}`);
  for (const p of rbA.data.value.postings || []) {
    const sys = p.systemGenerated ? " [AUTO-VAT]" : "";
    console.log(`  row=${p.row}: acct=${p.account?.number}(${p.account?.name}) amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || '-'}${sys}`);
  }

  console.log("\n--- Readback Voucher B (NET=8625) ---");
  const rbB = await api("GET", `/ledger/voucher/${vBid}?fields=${fields}`);
  for (const p of rbB.data.value.postings || []) {
    const sys = p.systemGenerated ? " [AUTO-VAT]" : "";
    console.log(`  row=${p.row}: acct=${p.account?.number}(${p.account?.name}) amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || '-'}${sys}`);
  }

  // =============================================
  // EXPERIMENT 3: What does the voucher look like when searched by posting amount?
  // The scorer might use GET /ledger/posting to find vouchers
  // =============================================
  console.log("\n=== EXPERIMENT 3: Search postings by amount ===");
  // Search for postings with amount=6900 (NET amount in GROSS voucher)
  const p6900 = await api("GET", `/ledger/posting?amountFrom=6899&amountTo=6901&dateFrom=2026-05-19&dateTo=2026-05-19&fields=id,amount,amountGross,voucher(id,number),account(number,name)`);
  console.log(`  Postings with amount≈6900: ${p6900.data.fullResultSize} found`);
  for (const p of (p6900.data.values || []).slice(0, 5)) {
    console.log(`    voucher=${p.voucher?.number} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross}`);
  }

  // Search for postings with amountGross=6900
  const pg6900 = await api("GET", `/ledger/posting?amountGrossFrom=6899&amountGrossTo=6901&dateFrom=2026-05-19&dateTo=2026-05-19&fields=id,amount,amountGross,voucher(id,number),account(number,name)`);
  console.log(`  Postings with amountGross≈6900: ${pg6900.data.fullResultSize} found`);
  for (const p of (pg6900.data.values || []).slice(0, 5)) {
    console.log(`    voucher=${p.voucher?.number} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross}`);
  }

  // =============================================
  // EXPERIMENT 4: Check what posting search params are available
  // Can scorer search by amountGross? Or only amount?
  // =============================================
  console.log("\n=== EXPERIMENT 4: Posting search with amountGross filter ===");
  // Search for the NET amount that equals the receipt line
  const pNet = await api("GET", `/ledger/posting?amountFrom=5519&amountTo=5521&dateFrom=2026-05-19&dateTo=2026-05-19&fields=id,amount,amountGross,voucher(id,number),account(number,name)`);
  console.log(`  Postings with amount≈5520 (GROSS voucher NET): ${pNet.data.fullResultSize} found`);
  for (const p of (pNet.data.values || []).slice(0, 5)) {
    console.log(`    voucher=${p.voucher?.number} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross}`);
  }

  // =============================================
  // EXPERIMENT 5: Branch A — Forretningslunsj
  // Test BOTH direct (13200) and ×1.25 (16500) to see posting state
  // =============================================
  console.log("\n=== EXPERIMENT 5: Branch A — Forretningslunsj 13200 ===");
  const acctRes2 = await api("GET", "/ledger/account?number=7360,2050&fields=id,number,name,vatType(*),vatLocked");
  const acct7360 = acctRes2.data.values.find((a: any) => a.number === 7360);
  console.log(`  7360: id=${acct7360.id} vatType.id=${acct7360.vatType?.id} vatLocked=${acct7360.vatLocked}`);

  const deptSalg = await api("GET", "/department?name=Drift&isInactive=false&fields=id,name");
  const deptDrift = (deptSalg.data.values || []).find((d: any) => d.name === "Drift");

  // GROSS: amountGross = 13200
  console.log("\n--- Branch A GROSS: amountGross=13200 ---");
  const vC = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-09",
    description: "Forretningslunsj",
    postings: [
      {
        row: 1, date: "2026-03-09", description: "Forretningslunsj",
        account: { id: acct7360.id },
        department: { id: deptDrift.id },
        amount: 13200, amountCurrency: 13200,
        amountGross: 13200, amountGrossCurrency: 13200,
      },
      {
        row: 2, date: "2026-03-09", description: "Forretningslunsj",
        account: { id: acct2050.id },
        amount: -13200, amountCurrency: -13200,
        amountGross: -13200, amountGrossCurrency: -13200,
      },
    ],
  });
  if (!vC.ok) { console.log(`  FAILED: ${JSON.stringify(vC.data).slice(0, 300)}`); return; }
  console.log(`  Created: id=${vC.data.value.id} number=${vC.data.value.number}`);

  const rbC = await api("GET", `/ledger/voucher/${vC.data.value.id}?fields=${fields}`);
  for (const p of rbC.data.value.postings || []) {
    console.log(`  row=${p.row}: acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} dept=${p.department?.name || '-'}`);
  }

  // NET: amountGross = 13200 × 1.25 = 16500
  console.log("\n--- Branch A NET: amountGross=16500 ---");
  const vD = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-09",
    description: "Forretningslunsj",
    postings: [
      {
        row: 1, date: "2026-03-09", description: "Forretningslunsj",
        account: { id: acct7360.id },
        department: { id: deptDrift.id },
        amount: 16500, amountCurrency: 16500,
        amountGross: 16500, amountGrossCurrency: 16500,
      },
      {
        row: 2, date: "2026-03-09", description: "Forretningslunsj",
        account: { id: acct2050.id },
        amount: -16500, amountCurrency: -16500,
        amountGross: -16500, amountGrossCurrency: -16500,
      },
    ],
  });
  if (!vD.ok) { console.log(`  FAILED: ${JSON.stringify(vD.data).slice(0, 300)}`); return; }
  console.log(`  Created: id=${vD.data.value.id} number=${vD.data.value.number}`);

  const rbD = await api("GET", `/ledger/voucher/${vD.data.value.id}?fields=${fields}`);
  for (const p of rbD.data.value.postings || []) {
    console.log(`  row=${p.row}: acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} dept=${p.department?.name || '-'}`);
  }

  // =============================================
  // EXPERIMENT 6: How does the scorer FIND the voucher?
  // Test different search methods
  // =============================================
  console.log("\n=== EXPERIMENT 6: How might scorer find vouchers? ===");

  // Method 1: Search vouchers by date
  const byDate = await api("GET", "/ledger/voucher?dateFrom=2026-05-19&dateTo=2026-05-19&count=100&fields=id,number,description,postings(row,amount,amountGross,account(number),department(name))");
  console.log(`  Vouchers on 2026-05-19: ${byDate.data.fullResultSize}`);

  // Method 2: Search postings by account number
  const by6540 = await api("GET", `/ledger/posting?accountNumberFrom=6540&accountNumberTo=6540&dateFrom=2026-05-19&dateTo=2026-05-19&fields=id,amount,amountGross,voucher(id,number,description),account(number),department(name)`);
  console.log(`  Postings on 6540 on 2026-05-19: ${by6540.data.fullResultSize}`);
  for (const p of (by6540.data.values || []).slice(0, 10)) {
    console.log(`    voucher #${p.voucher?.number} "${p.voucher?.description}" amount=${p.amount} amountGross=${p.amountGross} dept=${p.department?.name}`);
  }

  // =============================================
  // EXPERIMENT 7: Test Togbillett with 12% VAT — exact amounts
  // Receipt nb_01 has Togbillett 8750
  // =============================================
  console.log("\n=== EXPERIMENT 7: Togbillett 8750 with vatType 12 ===");
  const acctRes3 = await api("GET", "/ledger/account?number=7140,2050&fields=id,number,name,vatType(*),vatLocked");
  const acct7140 = acctRes3.data.values.find((a: any) => a.number === 7140);
  console.log(`  7140: id=${acct7140.id} vatType.id=${acct7140.vatType?.id}(${acct7140.vatType?.percentage}%) vatLocked=${acct7140.vatLocked}`);

  const deptAdm = await api("GET", "/department?name=Administrasjon&isInactive=false&fields=id,name");
  const admDept = (deptAdm.data.values || []).find((d: any) => d.name === "Administrasjon");

  // GROSS: amountGross = 8750
  const vE = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-27",
    description: "Togbillett",
    postings: [
      {
        row: 1, date: "2026-02-27", description: "Togbillett",
        account: { id: acct7140.id },
        department: { id: admDept.id },
        vatType: { id: acct7140.vatType.id },
        amountGross: 8750, amountGrossCurrency: 8750,
      },
      {
        row: 2, date: "2026-02-27", description: "Togbillett",
        account: { id: acct2050.id },
        amountGross: -8750, amountGrossCurrency: -8750,
      },
    ],
  });
  if (!vE.ok) { console.log(`  FAILED: ${JSON.stringify(vE.data).slice(0, 300)}`); return; }
  console.log(`  Created: id=${vE.data.value.id} number=${vE.data.value.number}`);

  const rbE = await api("GET", `/ledger/voucher/${vE.data.value.id}?fields=${fields}`);
  for (const p of rbE.data.value.postings || []) {
    const sys = p.systemGenerated ? " [AUTO-VAT]" : "";
    console.log(`  row=${p.row}: acct=${p.account?.number}(${p.account?.name}) amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}(${p.vatType?.percentage}%) dept=${p.department?.name || '-'}${sys}`);
  }

  // Key diagnostic: what amount and amountGross look like for both interpretations
  console.log("\n=== SUMMARY: GROSS vs NET side-by-side ===");
  console.log("Branch B (Tastatur 6900, 25% VAT):");
  console.log("  GROSS: amountGross=6900, auto-amount=5520, auto-VAT=1380");
  console.log("  NET:   amountGross=8625, auto-amount=6900, auto-VAT=1725");
  console.log("  Production e89025d1 used NET (8625) → Check 3 FAILED");
  console.log("  Scorer expects amountGross=6900 (GROSS/direct)");
  console.log("");
  console.log("Branch C (Togbillett 8750, 12% VAT):");
  console.log("  GROSS: amountGross=8750, auto-amount=7812.50, auto-VAT=937.50");
  console.log("  NET:   amountGross=10937.50, auto-amount=9765.63, auto-VAT=1171.88");
  console.log("  Production 3373fbc9 used NET (10937.50) + wrong vatType → Check 3 FAILED");
  console.log("");
  console.log("Branch A (Forretningslunsj 13200, vatLocked):");
  console.log("  GROSS: amountGross=13200, amount=13200 (all same)");
  console.log("  NET:   amountGross=16500, amount=16500 (all same)");
  console.log("  No T22 production evidence for Branch A");
  console.log("  Run 70014f3c used GROSS (13200) → Check 3 FAILED — BUT this is T17 (6 checks/13 max), NOT T22!");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
