/**
 * Task 15: Test if POST /invoice works without specifying vatType on order lines.
 * If it does, we can eliminate GET /ledger/vatType and save 1 call on every branch.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
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
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 800));
  }
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Step 1: Find an existing project to work with
  const projRes = await api("GET", "/project?count=5&fields=*,customer(*),projectManager(*)");
  const projects = projRes.data.values || [];
  if (projects.length === 0) {
    console.log("No projects found, creating fixture...");
    // Create a customer first
    const custRes = await api("POST", "/customer", {
      name: "VatType Test Customer",
      organizationNumber: "800000001",
      invoiceSendMethod: "MANUAL",
    });
    const customerId = custRes.data.value.id;

    // Get an employee for PM
    const empRes = await api("GET", "/employee?count=1&fields=*");
    const pmId = empRes.data.values[0].id;

    // Create project
    const projCreateRes = await api("POST", "/project", {
      name: "VatType Omission Test",
      startDate: TODAY,
      customer: { id: customerId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 100000,
      invoiceOnAccountVatHigh: false,
    });
    console.log("Created project:", projCreateRes.data.value?.id);
    var projectId = projCreateRes.data.value.id;
    var customerId2 = customerId;
  } else {
    // Use first available project
    const proj = projects[0];
    console.log(`Using existing project: ${proj.name} (id=${proj.id})`);
    console.log(`  customer: ${proj.customer?.name} (id=${proj.customer?.id})`);
    console.log(`  fixedprice: ${proj.fixedprice}, isFixedPrice: ${proj.isFixedPrice}`);
    var projectId = proj.id;
    var customerId2 = proj.customer?.id;

    // Make sure it's fixed price
    if (!proj.isFixedPrice) {
      await api("PUT", `/project/${proj.id}`, {
        id: proj.id,
        version: proj.version,
        name: proj.name,
        startDate: proj.startDate,
        customer: { id: proj.customer.id },
        projectManager: { id: proj.projectManager.id },
        isFixedPrice: true,
        fixedprice: proj.fixedprice || 100000,
        invoiceOnAccountVatHigh: false,
      });
    }
  }

  // Step 2: Check what vatTypes are available (for reference, not for the actual test)
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypes = (vatRes.data.values || []).filter((v: any) => v.percentage !== undefined);
  console.log("\nAvailable outgoing VAT types:");
  for (const v of vatTypes) {
    console.log(`  id=${v.id}, number=${v.number}, name=${v.name}, percentage=${v.percentage}%`);
  }

  // Step 3: Test POST /invoice WITHOUT vatType on order lines
  console.log("\n=== TEST A: POST /invoice WITHOUT vatType ===");
  const invoiceNoVat = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId2 },
    orders: [{
      customer: { id: customerId2 },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Milestone payment - 25% test (no vatType)",
        count: 1,
        unitPriceExcludingVatCurrency: 25000,
        // NO vatType specified!
      }],
    }],
  });

  if (invoiceNoVat.ok) {
    const inv = invoiceNoVat.data.value;
    console.log("SUCCESS! Invoice created without vatType:");
    console.log(`  id=${inv.id}`);
    console.log(`  amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${inv.amountCurrency}`);
    console.log(`  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);

    // Check what vatType was actually used
    const verifyRes = await api("GET", `/invoice/${inv.id}?fields=*,orders(*,orderLines(*)),orderLines(*)`);
    if (verifyRes.ok) {
      const orderLines = verifyRes.data.value?.orders?.[0]?.orderLines || verifyRes.data.value?.orderLines || [];
      console.log("\nActual vatType used on order lines:");
      for (const ol of orderLines) {
        console.log(`  description="${ol.description}", vatType.id=${ol.vatType?.id}, unitPrice=${ol.unitPriceExcludingVatCurrency}`);
      }
    }
  } else {
    console.log("FAILED: POST /invoice without vatType did not work");
  }

  // Step 4: Test POST /invoice WITH vatType for comparison
  console.log("\n=== TEST B: POST /invoice WITH vatType (control) ===");
  const vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
  const invoiceWithVat = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: customerId2 },
    orders: [{
      customer: { id: customerId2 },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Milestone payment - 25% test (with vatType)",
        count: 1,
        unitPriceExcludingVatCurrency: 25000,
        vatType: { id: vatType.id },
      }],
    }],
  });

  if (invoiceWithVat.ok) {
    const inv = invoiceWithVat.data.value;
    console.log("SUCCESS! Invoice created with vatType:");
    console.log(`  id=${inv.id}`);
    console.log(`  amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
    console.log(`  amountCurrency=${inv.amountCurrency}`);
    console.log(`  amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
