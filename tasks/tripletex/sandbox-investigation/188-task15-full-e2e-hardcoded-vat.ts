/**
 * Task 15: Complete E2E test — hardcoded vatType=3, keeping bank account proactive hedge.
 *
 * New call counts (saves 1 on every branch vs current):
 * - skip-PUT: 2 calls (was 3) — GET /project → POST /invoice
 * - update-needed+configured: 4 calls (was 5) — GET /project → PUT /project || GET /bank → POST /invoice
 * - update-needed+missing: 5 calls (was 6) — GET /project → PUT /project || GET /bank → PUT /bank → POST /invoice
 *
 * All production T15 runs used vatType id=3 (25% outgoing).
 * vatType 3 is the standard Norwegian 25% MVA — exists on every Tripletex account.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const HARDCODED_VAT_TYPE_ID = 3; // 25% outgoing — standard on all accounts

let callCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[Call ${callCount}] ${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 800));
  }
  return { status: r.status, ok: r.ok, data: json };
}

async function testUpdateNeededBranch(projName: string) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: UPDATE-NEEDED BRANCH (hardcoded vatType=3)");
  console.log("=".repeat(60));
  callCount = 0;

  const NEW_FIXED_PRICE = 300000 + Math.floor(Math.random() * 50000);
  const MILESTONE_PCT = 0.33;
  const MILESTONE_AMOUNT = NEW_FIXED_PRICE * MILESTONE_PCT;
  console.log(`Target: fixedprice=${NEW_FIXED_PRICE}, milestone=${MILESTONE_PCT * 100}% = ${MILESTONE_AMOUNT}`);

  // Call 1: GET /project
  const step1 = await api("GET", `/project?name=${encodeURIComponent(projName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = (step1.data.values || []).find((p: any) => p.name === projName);
  if (!proj) throw new Error(`Project "${projName}" not found`);
  console.log(`  Found: fixedprice=${proj.fixedprice}, PM=${proj.projectManager?.email}`);

  const needsUpdate = proj.fixedprice !== NEW_FIXED_PRICE || !proj.isFixedPrice;
  if (!needsUpdate) throw new Error("Project already at target — use skip-PUT test");

  // Calls 2-3 (parallel): PUT /project + GET /ledger/account (NO GET /ledger/vatType!)
  const [putRes, bankRes] = await Promise.all([
    api("PUT", `/project/${proj.id}`, {
      id: proj.id,
      version: proj.version,
      name: proj.name,
      startDate: proj.startDate,
      customer: { id: proj.customer.id },
      projectManager: { id: proj.projectManager.id },
      isFixedPrice: true,
      fixedprice: NEW_FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    }),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  if (!putRes.ok) throw new Error("PUT /project failed");
  console.log(`  Updated project: fixedprice=${putRes.data.value.fixedprice}`);

  // Conditional: fix bank account if missing
  const acct1920 = (bankRes.data.values || []).find((a: any) => a.number === 1920);
  if (acct1920 && !acct1920.bankAccountNumber) {
    console.log("  Bank account missing, fixing...");
    await api("PUT", `/ledger/account/${acct1920.id}`, {
      id: acct1920.id,
      version: acct1920.version,
      number: acct1920.number,
      name: acct1920.name,
      bankAccountNumber: "12345678903",
    });
  } else {
    console.log("  Bank account already configured");
  }

  // Final call: POST /invoice with HARDCODED vatType=3
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Milestone payment - ${MILESTONE_PCT * 100}% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: HARDCODED_VAT_TYPE_ID },
      }],
    }],
  });

  if (!invoiceRes.ok) throw new Error("POST /invoice failed");

  const inv = invoiceRes.data.value;
  console.log(`\n  RESULT:`);
  console.log(`  Total API calls: ${callCount}`);
  console.log(`  Invoice id: ${inv.id}`);
  console.log(`  amountExcludingVatCurrency: ${inv.amountExcludingVatCurrency} (expected: ${MILESTONE_AMOUNT})`);
  console.log(`  amountCurrency: ${inv.amountCurrency} (= ${inv.amountExcludingVatCurrency} * 1.25 = ${inv.amountExcludingVatCurrency * 1.25})`);
  console.log(`  Match: ${inv.amountExcludingVatCurrency === MILESTONE_AMOUNT ? "YES ✓" : "NO ✗"}`);

  return { callCount, fixedprice: NEW_FIXED_PRICE, milestone: MILESTONE_AMOUNT };
}

async function testSkipPutBranch(projName: string, expectedFixedPrice: number) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: SKIP-PUT BRANCH (hardcoded vatType=3)");
  console.log("=".repeat(60));
  callCount = 0;

  const MILESTONE_PCT = 0.50;
  const MILESTONE_AMOUNT = expectedFixedPrice * MILESTONE_PCT;
  console.log(`Target: fixedprice=${expectedFixedPrice} (already set), milestone=${MILESTONE_PCT * 100}% = ${MILESTONE_AMOUNT}`);

  // Call 1: GET /project (verifies fixedprice matches, so no PUT needed)
  const step1 = await api("GET", `/project?name=${encodeURIComponent(projName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = (step1.data.values || []).find((p: any) => p.name === projName);
  if (!proj) throw new Error(`Project "${projName}" not found`);
  console.log(`  Found: fixedprice=${proj.fixedprice}, expected=${expectedFixedPrice}`);

  if (proj.fixedprice !== expectedFixedPrice) {
    throw new Error(`Project fixedprice mismatch: ${proj.fixedprice} !== ${expectedFixedPrice}`);
  }

  // Call 2: POST /invoice directly (no PUT /project, no GET /vatType, no bank check)
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Milestone payment - ${MILESTONE_PCT * 100}% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: HARDCODED_VAT_TYPE_ID },
      }],
    }],
  });

  if (!invoiceRes.ok) throw new Error("POST /invoice failed");

  const inv = invoiceRes.data.value;
  console.log(`\n  RESULT:`);
  console.log(`  Total API calls: ${callCount}`);
  console.log(`  Invoice id: ${inv.id}`);
  console.log(`  amountExcludingVatCurrency: ${inv.amountExcludingVatCurrency} (expected: ${MILESTONE_AMOUNT})`);
  console.log(`  amountCurrency: ${inv.amountCurrency}`);
  console.log(`  Match: ${inv.amountExcludingVatCurrency === MILESTONE_AMOUNT ? "YES ✓" : "NO ✗"}`);

  return { callCount };
}

async function testUpdateNeededMissingBank(projName: string) {
  console.log("\n" + "=".repeat(60));
  console.log("TEST: UPDATE-NEEDED + MISSING BANK (hardcoded vatType=3)");
  console.log("=".repeat(60));

  // First, break the bank account to simulate missing-bank state
  console.log("Breaking bank account to simulate missing state...");
  const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const acct1920 = (bankRes.data.values || []).find((a: any) => a.number === 1920);
  if (acct1920 && acct1920.bankAccountNumber) {
    await api("PUT", `/ledger/account/${acct1920.id}`, {
      id: acct1920.id,
      version: acct1920.version,
      number: acct1920.number,
      name: acct1920.name,
      bankAccountNumber: "", // Clear it!
    });
    console.log("  Bank account cleared");
  }

  // Now run the actual test
  callCount = 0;

  const NEW_FIXED_PRICE = 400000 + Math.floor(Math.random() * 50000);
  const MILESTONE_PCT = 0.75;
  const MILESTONE_AMOUNT = NEW_FIXED_PRICE * MILESTONE_PCT;
  console.log(`Target: fixedprice=${NEW_FIXED_PRICE}, milestone=${MILESTONE_PCT * 100}% = ${MILESTONE_AMOUNT}`);

  // Call 1: GET /project
  const step1 = await api("GET", `/project?name=${encodeURIComponent(projName)}&count=50&fields=*,customer(*),projectManager(*)`);
  const proj = (step1.data.values || []).find((p: any) => p.name === projName);
  if (!proj) throw new Error(`Project "${projName}" not found`);

  // Calls 2-3 (parallel): PUT /project + GET /ledger/account
  const [putRes, bankRes2] = await Promise.all([
    api("PUT", `/project/${proj.id}`, {
      id: proj.id,
      version: proj.version,
      name: proj.name,
      startDate: proj.startDate,
      customer: { id: proj.customer.id },
      projectManager: { id: proj.projectManager.id },
      isFixedPrice: true,
      fixedprice: NEW_FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    }),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  if (!putRes.ok) throw new Error("PUT /project failed");

  // Call 4: PUT /ledger/account (fix missing bank)
  const acct = (bankRes2.data.values || []).find((a: any) => a.number === 1920);
  if (acct && !acct.bankAccountNumber) {
    console.log("  Bank account missing — fixing...");
    await api("PUT", `/ledger/account/${acct.id}`, {
      id: acct.id,
      version: acct.version,
      number: acct.number,
      name: acct.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Call 5: POST /invoice with HARDCODED vatType=3
  const invoiceRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: proj.customer.id },
    orders: [{
      customer: { id: proj.customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Milestone payment - ${MILESTONE_PCT * 100}% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: HARDCODED_VAT_TYPE_ID },
      }],
    }],
  });

  if (!invoiceRes.ok) throw new Error("POST /invoice failed");

  const inv = invoiceRes.data.value;
  console.log(`\n  RESULT:`);
  console.log(`  Total API calls: ${callCount}`);
  console.log(`  Invoice id: ${inv.id}`);
  console.log(`  amountExcludingVatCurrency: ${inv.amountExcludingVatCurrency} (expected: ${MILESTONE_AMOUNT})`);
  console.log(`  amountCurrency: ${inv.amountCurrency}`);
  console.log(`  Match: ${inv.amountExcludingVatCurrency === MILESTONE_AMOUNT ? "YES ✓" : "NO ✗"}`);

  return { callCount };
}

async function main() {
  // Find existing project
  const projRes = await api("GET", "/project?count=5&fields=*,customer(*),projectManager(*)");
  const projName = projRes.data.values?.[0]?.name;
  if (!projName) throw new Error("No projects found");
  callCount = 0;

  // Test 1: update-needed + configured bank
  const t1 = await testUpdateNeededBranch(projName);
  console.log(`\n>>> Branch: update-needed+configured = ${t1.callCount} calls (was 5)`);

  // Test 2: skip-PUT (project already at target fixedprice from test 1)
  const t2 = await testSkipPutBranch(projName, t1.fixedprice);
  console.log(`\n>>> Branch: skip-PUT = ${t2.callCount} calls (was 3)`);

  // Test 3: update-needed + missing bank
  const t3 = await testUpdateNeededMissingBank(projName);
  console.log(`\n>>> Branch: update-needed+missing-bank = ${t3.callCount} calls (was 6)`);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`skip-PUT:                ${t2.callCount} calls (was 3, saved ${3 - t2.callCount})`);
  console.log(`update-needed+configured: ${t1.callCount} calls (was 5, saved ${5 - t1.callCount})`);
  console.log(`update-needed+missing:    ${t3.callCount} calls (was 6, saved ${6 - t3.callCount})`);
}

main().catch(e => { console.error(e); process.exit(1); });
