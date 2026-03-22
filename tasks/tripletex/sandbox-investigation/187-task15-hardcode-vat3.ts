/**
 * Task 15: Test hardcoding vatType={id:3} (25% outgoing) on POST /invoice
 * without doing GET /ledger/vatType first.
 *
 * Hypothesis: vatType id=3 is stable across all Tripletex accounts for 25% outgoing.
 * Evidence: Every T15 production run used id=3, and sandbox also shows id=3.
 *
 * If this works, we save 1 call on EVERY branch:
 * - skip-PUT: 3 → 2 calls
 * - update-needed+configured: 5 → 4 calls
 * - update-needed+missing: 6 → 5 calls
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

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

async function main() {
  // Create a fresh fixture to simulate production T15 flow
  console.log("=== FIXTURE SETUP (not counted) ===");
  callCount = 0; // Reset after fixture

  // Find existing project
  const projRes = await api("GET", "/project?count=5&fields=*,customer(*),projectManager(*)");
  const projects = projRes.data.values || [];
  const proj = projects[0];
  if (!proj) throw new Error("No projects found");

  console.log(`Using project: ${proj.name} (id=${proj.id})`);
  console.log(`  fixedprice=${proj.fixedprice}, isFixedPrice=${proj.isFixedPrice}`);
  console.log(`  customer: ${proj.customer?.name} (id=${proj.customer?.id})`);
  console.log(`  PM: ${proj.projectManager?.email} (id=${proj.projectManager?.id})`);

  const projectId = proj.id;
  const customerId = proj.customer.id;

  // Ensure bank account is configured (simulate configured-bank state)
  const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const acct1920 = (bankRes.data.values || []).find((a: any) => a.number === 1920);
  if (acct1920 && !acct1920.bankAccountNumber) {
    console.log("Fixing bank account for test...");
    await api("PUT", `/ledger/account/${acct1920.id}`, {
      id: acct1920.id,
      version: acct1920.version,
      number: acct1920.number,
      name: acct1920.name,
      bankAccountNumber: "12345678903",
    });
  }

  // Reset call count for actual test
  console.log("\n=== TEST: FULL T15 FLOW WITH HARDCODED vatType=3 ===");
  callCount = 0;

  // Simulate update-needed branch (project fixedprice needs to change)
  const NEW_FIXED_PRICE = 200000 + Math.floor(Math.random() * 10000);
  const MILESTONE_PCT = 0.25;
  const MILESTONE_AMOUNT = NEW_FIXED_PRICE * MILESTONE_PCT;

  console.log(`\nTarget: fixedprice=${NEW_FIXED_PRICE}, milestone=${MILESTONE_PCT * 100}% = ${MILESTONE_AMOUNT}`);

  // Call 1: GET /project (initial read)
  const step1 = await api("GET", `/project?name=${encodeURIComponent(proj.name)}&count=50&fields=*,customer(*),projectManager(*)`);
  const foundProj = (step1.data.values || []).find((p: any) => p.name === proj.name);
  if (!foundProj) throw new Error("Project not found");
  console.log(`  Found project: fixedprice=${foundProj.fixedprice}, PM=${foundProj.projectManager?.email}`);

  // Call 2: PUT /project (update fixedprice) — NO GET /ledger/vatType!
  const step2 = await api("PUT", `/project/${foundProj.id}`, {
    id: foundProj.id,
    version: foundProj.version,
    name: foundProj.name,
    startDate: foundProj.startDate,
    customer: { id: foundProj.customer.id },
    projectManager: { id: foundProj.projectManager.id },
    isFixedPrice: true,
    fixedprice: NEW_FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  });
  if (!step2.ok) throw new Error("PUT /project failed");
  console.log(`  Updated project: fixedprice=${step2.data.value.fixedprice}`);

  // Call 3: POST /invoice with HARDCODED vatType={id:3}
  const step3 = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: foundProj.customer.id },
    orders: [{
      customer: { id: foundProj.customer.id },
      project: { id: foundProj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Milestone payment - ${MILESTONE_PCT * 100}% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: 3 }, // HARDCODED! No GET /ledger/vatType needed
      }],
    }],
  });

  if (!step3.ok) throw new Error("POST /invoice failed");

  const inv = step3.data.value;
  console.log(`\n=== RESULT ===`);
  console.log(`Total API calls: ${callCount}`);
  console.log(`Invoice id: ${inv.id}`);
  console.log(`amountExcludingVatCurrency: ${inv.amountExcludingVatCurrency}`);
  console.log(`amountCurrency: ${inv.amountCurrency}`);
  console.log(`amountCurrencyOutstanding: ${inv.amountCurrencyOutstanding}`);
  console.log(`Expected milestone amount (ex-VAT): ${MILESTONE_AMOUNT}`);
  console.log(`Match: ${inv.amountExcludingVatCurrency === MILESTONE_AMOUNT ? "YES" : "NO"}`);

  // Verify the invoice details
  const verify = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`);
  if (verify.ok) {
    const v = verify.data.value;
    console.log(`\nVerification (extra call, not counted in flow):`);
    console.log(`  orders[0].project.id: ${v.orders?.[0]?.project?.id}`);
    console.log(`  orders[0].project.fixedprice: ${v.orders?.[0]?.project?.fixedprice}`);
    const ol = v.orders?.[0]?.orderLines?.[0] || v.orderLines?.[0];
    console.log(`  orderLine vatType.id: ${ol?.vatType?.id}`);
    console.log(`  orderLine vatType.percentage: ${ol?.vatType?.percentage}%`);
  }

  // Now test skip-PUT branch
  console.log("\n\n=== TEST: SKIP-PUT BRANCH WITH HARDCODED vatType=3 ===");
  callCount = 0;

  // Use a DIFFERENT fixed price that matches what we just set
  const SKIP_MILESTONE = NEW_FIXED_PRICE * 0.50;

  // Call 1: GET /project (verifies fixedprice already matches)
  const skipStep1 = await api("GET", `/project?name=${encodeURIComponent(proj.name)}&count=50&fields=*,customer(*),projectManager(*)`);
  const skipProj = (skipStep1.data.values || []).find((p: any) => p.name === proj.name);
  console.log(`  fixedprice=${skipProj.fixedprice}, target=${NEW_FIXED_PRICE}, match=${skipProj.fixedprice === NEW_FIXED_PRICE}`);

  // Call 2: POST /invoice directly (no PUT /project, no GET /vatType)
  const skipStep2 = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: skipProj.customer.id },
    orders: [{
      customer: { id: skipProj.customer.id },
      project: { id: skipProj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Milestone payment - 50% of fixed price`,
        count: 1,
        unitPriceExcludingVatCurrency: SKIP_MILESTONE,
        vatType: { id: 3 }, // HARDCODED!
      }],
    }],
  });

  if (!skipStep2.ok) throw new Error("POST /invoice (skip-PUT) failed");

  const inv2 = skipStep2.data.value;
  console.log(`\n=== RESULT (skip-PUT) ===`);
  console.log(`Total API calls: ${callCount}`);
  console.log(`Invoice id: ${inv2.id}`);
  console.log(`amountExcludingVatCurrency: ${inv2.amountExcludingVatCurrency}`);
  console.log(`amountCurrency: ${inv2.amountCurrency}`);
  console.log(`Expected milestone amount (ex-VAT): ${SKIP_MILESTONE}`);
  console.log(`Match: ${inv2.amountExcludingVatCurrency === SKIP_MILESTONE ? "YES" : "NO"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
