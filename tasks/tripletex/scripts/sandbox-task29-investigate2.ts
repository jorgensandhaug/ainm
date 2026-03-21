// Investigation: How to grant project manager access to a newly created employee
// And explore supplier invoice creation

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T29b-${Date.now()}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: RequestInit = { method, headers: H };
  if (body) {
    opts.body = JSON.stringify(body);
    console.log("  Body:", JSON.stringify(body).slice(0, 800));
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`  Status: ${r.status}`);
  if (!r.ok) {
    console.log(`  Error: ${text.slice(0, 800)}`);
    return { ok: false, status: r.status, error: text };
  }
  const parsed = JSON.parse(text);
  return { ok: true, status: r.status, data: parsed };
}

async function main() {
  // 1. Check what employee fields control project manager access
  // Read the assignable manager to see what fields they have
  const mgrR = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
  const mgr = mgrR.data?.values?.[0];
  console.log("\n=== Assignable manager fields ===");
  console.log(`  id: ${mgr?.id}`);
  console.log(`  userType: ${mgr?.userType}`);
  console.log(`  allowInformationRegistration: ${mgr?.allowInformationRegistration}`);
  console.log(`  isProjectManager: ${mgr?.isProjectManager}`);

  // Dump all top-level keys
  if (mgr) {
    const keys = Object.keys(mgr).sort();
    console.log(`  All keys: ${keys.join(", ")}`);
  }

  // 2. Create a test employee and try to make them a project manager
  const deptR = await api("GET", "/department?isInactive=false&count=1&fields=*");
  const deptId = deptR.data?.values?.[0]?.id;
  const divR = await api("GET", "/division?count=1&fields=*");
  const divId = divR.data?.values?.[0]?.id;

  // Try different userTypes to see which allows project manager
  const userTypes = ["STANDARD", "EXTENDED", "NO_ACCESS"];

  for (const ut of userTypes) {
    console.log(`\n=== TEST: Create employee with userType=${ut} ===`);
    const empR = await api("POST", "/employee", {
      firstName: "Test",
      lastName: `Manager-${ut}`,
      email: `test.mgr.${ut}.${SUFFIX}@example.org`,
      dateOfBirth: "1985-01-01",
      userType: ut,
      department: { id: deptId },
      employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
    });

    if (!empR.ok) {
      console.log(`  Failed to create with userType=${ut}`);
      continue;
    }

    const empId = empR.data?.value?.id;
    console.log(`  Created employee id=${empId}`);

    // Check if they appear as assignable
    const checkR = await api("GET", `/employee?assignableProjectManagers=true&id=${empId}&fields=*`);
    const found = checkR.data?.values?.length > 0;
    console.log(`  Is assignable project manager? ${found}`);

    if (found) {
      // Try using them as project manager
      const custR = await api("POST", "/customer", {
        name: `TestCust-${ut}-${SUFFIX}`,
        isCustomer: true,
      });
      const projR = await api("POST", "/project", {
        name: `TestProj-${ut}-${SUFFIX}`,
        startDate: TODAY,
        customer: { id: custR.data?.value?.id },
        projectManager: { id: empId },
      });
      console.log(`  Can be project manager? ${projR.ok}`);
    }
  }

  // 3. Can we update an existing NO_ACCESS employee to a higher userType?
  console.log("\n\n=== TEST: Update NO_ACCESS employee to STANDARD ===");
  const noAccessR = await api("POST", "/employee", {
    firstName: "Upgrade",
    lastName: `Test-${SUFFIX}`,
    email: `upgrade.${SUFFIX}@example.org`,
    dateOfBirth: "1985-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
  });

  if (noAccessR.ok) {
    const empId = noAccessR.data?.value?.id;
    console.log(`  Created NO_ACCESS employee: ${empId}`);

    // Try PUT to change userType
    const emp = noAccessR.data?.value;
    const updateR = await api("PUT", `/employee/${empId}`, {
      ...emp,
      userType: "STANDARD",
    });
    console.log(`  Update to STANDARD: ${updateR.ok ? 'SUCCESS' : 'FAILED'}`);

    if (updateR.ok) {
      // Check if now assignable
      const checkR = await api("GET", `/employee?assignableProjectManagers=true&id=${empId}&fields=*`);
      console.log(`  Is now assignable? ${checkR.data?.values?.length > 0}`);
    }
  }

  // 4. Explore supplier invoice endpoint
  console.log("\n\n=== SUPPLIER INVOICE INVESTIGATION ===");

  // Check what endpoints exist
  const supR = await api("POST", "/supplier", {
    name: `TestSupplier-${SUFFIX}`,
    organizationNumber: "889264985",
    isSupplier: true,
  });
  const supplierId = supR.data?.value?.id;

  // Check incoming VAT types
  const vatInR = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${TODAY}&fields=*`);
  console.log("\nIncoming VAT types:");
  for (const v of (vatInR.data?.values || []).slice(0, 5)) {
    console.log(`  id=${v.id} name=${v.name} pct=${v.percentage}`);
  }
  const inVatId = vatInR.data?.values?.find((v: any) => v.percentage === 25)?.id;

  // Try POST /supplierInvoice
  console.log("\n--- POST /supplierInvoice ---");
  const si1 = await api("POST", "/supplierInvoice", {
    invoiceDate: TODAY,
    dueDate: "2026-04-20",
    supplier: { id: supplierId },
    invoiceNumber: `SI-${SUFFIX}`,
    orders: [{
      orderDate: TODAY,
      deliveryDate: TODAY,
      supplier: { id: supplierId },
      orderLines: [{
        description: "Supplier cost test",
        count: 1,
        unitPriceExcludingVatCurrency: 56750,
        vatType: { id: inVatId },
      }],
    }],
  });

  if (!si1.ok) {
    // Try without orders (maybe different structure)
    console.log("\n--- Simpler supplierInvoice ---");
    const si2 = await api("POST", "/supplierInvoice", {
      invoiceDate: TODAY,
      dueDate: "2026-04-20",
      supplier: { id: supplierId },
      invoiceNumber: `SI2-${SUFFIX}`,
      lines: [{
        description: "Supplier cost test",
        count: 1,
        unitPriceExcludingVatCurrency: 56750,
        vatType: { id: inVatId },
      }],
    });
  }

  // Try POST /supplierInvoice/voucher approach
  console.log("\n--- Check /supplierInvoice schema ---");
  // Just read existing supplier invoices to understand structure
  const siListR = await api("GET", "/supplierInvoice?count=5&fields=*");
  if (siListR.data?.values?.length > 0) {
    console.log("\nExisting supplier invoices:");
    for (const si of siListR.data.values) {
      console.log(`  id=${si.id} number=${si.invoiceNumber} supplier=${si.supplier?.id} amount=${si.amount}`);
    }
  } else {
    console.log("No existing supplier invoices found");
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
