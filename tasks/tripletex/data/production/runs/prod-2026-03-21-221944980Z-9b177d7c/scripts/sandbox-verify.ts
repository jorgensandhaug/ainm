// Sandbox verification: confirm the project-first path and check if skip-PUT is possible
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(j, null, 2));
  return { status: r.status, data: j };
}

async function main() {
  // Step 1: Check if a project named "Implementación ERP" with matching customer exists
  const projRes = await api("GET", "/project?name=Implementaci%C3%B3n%20ERP&count=50&fields=*,customer(*),projectManager(*)");
  const projects = projRes.data?.values || [];
  console.log(`Found ${projects.length} projects named "Implementación ERP"`);

  for (const p of projects) {
    console.log(`  Project id=${p.id} name="${p.name}" fixedprice=${p.fixedprice} isFixedPrice=${p.isFixedPrice}`);
    console.log(`    customer: id=${p.customer?.id} orgNo=${p.customer?.organizationNumber} name="${p.customer?.name}"`);
    console.log(`    PM: id=${p.projectManager?.id} email=${p.projectManager?.email}`);
  }

  // Find exact match
  const match = projects.find((p: any) =>
    p.name === "Implementación ERP" &&
    p.customer?.organizationNumber === "866378843"
  );

  if (!match) {
    console.log("\nNo existing project match found. Need to set up fixture for sandbox test.");

    // Set up fixture: create customer, find PM, create project
    console.log("\n--- Setting up sandbox fixture ---");

    // Find or create customer
    const custRes = await api("GET", "/customer?organizationNumber=866378843&count=10&fields=*");
    let customerId: number;
    const custs = custRes.data?.values || [];
    const exactCust = custs.find((c: any) => c.organizationNumber === "866378843");
    if (exactCust) {
      customerId = exactCust.id;
      console.log(`Existing customer id=${customerId}`);
    } else {
      const newCust = await api("POST", "/customer", {
        name: "Solmar SL",
        organizationNumber: "866378843",
        invoiceSendMethod: "MANUAL"
      });
      customerId = newCust.data?.value?.id;
      console.log(`Created customer id=${customerId}`);
    }

    // Find PM
    const empRes = await api("GET", "/employee?email=maria.sanchez@example.org&assignableProjectManagers=true&count=10&fields=*");
    const emps = empRes.data?.values || [];
    // Use first assignable PM if exact match not found (sandbox may not have this specific employee)
    let managerId: number;
    const exactEmp = emps.find((e: any) => e.email === "maria.sanchez@example.org");
    if (exactEmp) {
      managerId = exactEmp.id;
    } else if (emps.length > 0) {
      managerId = emps[0].id;
      console.log(`Using sandbox PM id=${managerId} email=${emps[0].email} (exact match not available)`);
    } else {
      // Just get any employee
      const allEmp = await api("GET", "/employee?count=1&fields=*");
      managerId = allEmp.data?.values?.[0]?.id;
      console.log(`Using any employee as PM: id=${managerId}`);
    }

    // Create project with initial state (NOT the target state, to simulate update-needed branch)
    const newProj = await api("POST", "/project", {
      name: "Implementación ERP",
      startDate: "2026-03-21",
      customer: { id: customerId },
      projectManager: { id: managerId },
      isFixedPrice: false,
      fixedprice: 0,
      invoiceOnAccountVatHigh: false
    });
    const projectId = newProj.data?.value?.id;
    console.log(`Created project id=${projectId} for fixture`);

    console.log("\n--- Now measuring update-needed proactive hedge path ---");
    let callCount = 0;

    // Call 1: GET /project (re-read to simulate fresh start)
    callCount++;
    const freshProjRes = await api("GET", "/project?name=Implementaci%C3%B3n%20ERP&count=50&fields=*,customer(*),projectManager(*)");
    const freshMatch = freshProjRes.data?.values?.find((p: any) =>
      p.name === "Implementación ERP" && p.customer?.organizationNumber === "866378843"
    );
    console.log(`Call ${callCount}: GET /project -> found match id=${freshMatch?.id} fixedprice=${freshMatch?.fixedprice}`);

    // Call 2: PUT /project (update to target fixed price)
    callCount++;
    const updProj = await api("PUT", `/project/${freshMatch.id}`, {
      id: freshMatch.id,
      name: "Implementación ERP",
      startDate: freshMatch.startDate,
      customer: { id: freshMatch.customer.id },
      projectManager: { id: freshMatch.projectManager.id },
      isFixedPrice: true,
      fixedprice: 457650,
      invoiceOnAccountVatHigh: false
    });
    console.log(`Call ${callCount}: PUT /project -> fixedprice=${updProj.data?.value?.fixedprice}`);

    // Call 3: GET /ledger/vatType
    callCount++;
    const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
    const vatTypes = vatRes.data?.values || [];
    let vatType = vatTypes.find((v: any) => v.percentage === 25) || vatTypes.find((v: any) => v.percentage === 0);
    console.log(`Call ${callCount}: GET /ledger/vatType -> using id=${vatType?.id} (${vatType?.percentage}%)`);

    // Call 4: POST /order
    callCount++;
    const partialAmount = 457650 * 0.25; // = 114412.5
    const orderRes = await api("POST", "/order", {
      customer: { id: freshMatch.customer.id },
      project: { id: freshMatch.id },
      orderDate: "2026-03-21",
      deliveryDate: "2026-03-21",
      orderLines: [{
        description: "Implementación ERP – 25% pago parcial",
        count: 1,
        unitPriceExcludingVatCurrency: partialAmount,
        vatType: { id: vatType.id }
      }]
    });
    const orderId = orderRes.data?.value?.id;
    console.log(`Call ${callCount}: POST /order -> id=${orderId}`);

    // Call 5: GET /ledger/account (proactive hedge)
    callCount++;
    const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = bankRes.data?.values || [];
    const invoiceAcct = accounts.find((a: any) => a.number === 1920);
    console.log(`Call ${callCount}: GET /ledger/account -> account 1920 bankAccountNumber="${invoiceAcct?.bankAccountNumber}"`);

    if (invoiceAcct && (!invoiceAcct.bankAccountNumber || invoiceAcct.bankAccountNumber.trim() === "")) {
      callCount++;
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        id: invoiceAcct.id,
        number: invoiceAcct.number,
        name: invoiceAcct.name,
        bankAccountNumber: "12345678903"
      });
      console.log(`Call ${callCount}: PUT /ledger/account -> fixed bank number`);
    }

    // Call 6 (or 7): PUT /order/:invoice
    callCount++;
    const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
    console.log(`Call ${callCount}: PUT /order/:invoice -> invoice id=${invRes.data?.value?.id}`);
    console.log(`  amountExcludingVatCurrency=${invRes.data?.value?.amountExcludingVatCurrency}`);
    console.log(`  amountCurrencyOutstanding=${invRes.data?.value?.amountCurrencyOutstanding}`);

    console.log(`\n=== UPDATE-NEEDED PROACTIVE HEDGE: ${callCount} measured calls ===`);

    // Now test skip-PUT branch: project already has correct state
    console.log("\n--- Now measuring skip-PUT branch ---");
    let skipCallCount = 0;

    // Call 1: GET /project
    skipCallCount++;
    const skipProjRes = await api("GET", "/project?name=Implementaci%C3%B3n%20ERP&count=50&fields=*,customer(*),projectManager(*)");
    const skipMatch = skipProjRes.data?.values?.find((p: any) =>
      p.name === "Implementación ERP" && p.customer?.organizationNumber === "866378843"
    );
    console.log(`Call ${skipCallCount}: GET /project -> fixedprice=${skipMatch?.fixedprice} isFixedPrice=${skipMatch?.isFixedPrice}`);
    console.log(`  PM email=${skipMatch?.projectManager?.email}`);

    const canSkip = skipMatch?.fixedprice === 457650 && skipMatch?.isFixedPrice === true;
    console.log(`  Can skip PUT: ${canSkip}`);

    if (canSkip) {
      // Call 2: GET /ledger/vatType
      skipCallCount++;
      const vatRes2 = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
      const vatTypes2 = vatRes2.data?.values || [];
      let vatType2 = vatTypes2.find((v: any) => v.percentage === 25) || vatTypes2.find((v: any) => v.percentage === 0);
      console.log(`Call ${skipCallCount}: GET /ledger/vatType -> using id=${vatType2?.id} (${vatType2?.percentage}%)`);

      // Call 3: POST /order
      skipCallCount++;
      const orderRes2 = await api("POST", "/order", {
        customer: { id: skipMatch.customer.id },
        project: { id: skipMatch.id },
        orderDate: "2026-03-21",
        deliveryDate: "2026-03-21",
        orderLines: [{
          description: "Implementación ERP – 25% pago parcial (skip-PUT proof)",
          count: 1,
          unitPriceExcludingVatCurrency: partialAmount,
          vatType: { id: vatType2.id }
        }]
      });
      const orderId2 = orderRes2.data?.value?.id;
      console.log(`Call ${skipCallCount}: POST /order -> id=${orderId2}`);

      // Call 4: PUT /order/:invoice (no bank check needed on skip-PUT branch)
      skipCallCount++;
      const invRes2 = await api("PUT", `/order/${orderId2}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false`);
      console.log(`Call ${skipCallCount}: PUT /order/:invoice -> invoice id=${invRes2.data?.value?.id}`);
      console.log(`  amountExcludingVatCurrency=${invRes2.data?.value?.amountExcludingVatCurrency}`);
      console.log(`  amountCurrencyOutstanding=${invRes2.data?.value?.amountCurrencyOutstanding}`);
    }

    console.log(`\n=== SKIP-PUT BRANCH: ${skipCallCount} measured calls ===`);
  } else {
    console.log(`\nProject already exists with fixedprice=${match.fixedprice}, isFixedPrice=${match.isFixedPrice}`);
    console.log("Sandbox already has fixture from prior run.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
