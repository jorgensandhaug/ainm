// TASK 29: Test if vendor field works on project/orderline
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  const TODAY = "2026-03-21";

  // Get existing resources
  const mgrRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
  const mgrId = mgrRes.data?.values?.[0]?.id;

  // Create customer, supplier
  const custRes = await api("POST", "/customer", { name: "Test29C Customer", isCustomer: true });
  const custId = custRes.data?.value?.id;

  const suppRes = await api("POST", "/supplier", { name: "Test29C Supplier", organizationNumber: "889264985", isSupplier: true });
  const suppId = suppRes.data?.value?.id;
  console.log(`Customer=${custId} Supplier=${suppId} Mgr=${mgrId}`);

  // Create project
  const projRes = await api("POST", "/project", {
    name: "Test29C Project",
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: mgrId },
  });
  const projectId = projRes.data?.value?.id;
  console.log(`Project=${projectId}`);

  // Test 1: orderline WITH vendor (using supplier id)
  console.log("\n--- Test 1: orderline with vendor.id = supplier.id ---");
  const ol1 = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Supplier cost - Test29C Supplier",
    date: TODAY,
    count: 1,
    unitCostCurrency: 56750,
    isChargeable: false,
    vendor: { id: suppId },
  });
  console.log(`Orderline 1: status=${ol1.status} id=${ol1.data?.value?.id}`);
  if (ol1.data?.value) {
    console.log(`  vendor: ${JSON.stringify(ol1.data.value.vendor)}`);
    console.log(`  unitCostCurrency: ${ol1.data.value.unitCostCurrency}`);
  }

  // Read it back to verify vendor persisted
  if (ol1.data?.value?.id) {
    const readback = await api("GET", `/project/orderline/${ol1.data.value.id}?fields=*`);
    if (readback.data?.value) {
      console.log(`  readback vendor: ${JSON.stringify(readback.data.value.vendor)}`);
    }
  }

  // Test 2: Check if supplier objects are linked via company
  // The vendor field takes a Company, and POST /supplier creates a Company+Supplier
  // Let's check if the supplier has a company id we can use
  console.log("\n--- Test 2: Check supplier company linkage ---");
  const suppDetail = await api("GET", `/supplier/${suppId}?fields=*`);
  if (suppDetail.data?.value) {
    console.log(`  Supplier detail: id=${suppDetail.data.value.id}`);
    console.log(`  name=${suppDetail.data.value.name}`);
    console.log(`  organizationNumber=${suppDetail.data.value.organizationNumber}`);
    // Check if there's a company-level id
    for (const [k, v] of Object.entries(suppDetail.data.value)) {
      if (typeof v === 'object' && v !== null) {
        console.log(`  ${k}: ${JSON.stringify(v).slice(0, 100)}`);
      }
    }
  }

  // Test 3: Now also check what the invoice looks like
  console.log("\n--- Test 3: Invoice with project ---");

  // Get VAT type for outgoing
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatTypeId = vatRes.data?.values?.[0]?.id;

  // Get bank account
  const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  let bankAcct = bankRes.data?.values?.[0];
  if (!bankAcct?.bankAccountNumber) {
    await api("PUT", `/ledger/account/${bankAcct.id}`, { ...bankAcct, bankAccountNumber: "12345678903" });
  }

  const invRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [
      {
        customer: { id: custId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Project Services",
            count: 1,
            unitPriceExcludingVatCurrency: 396900,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  });
  console.log(`Invoice: status=${invRes.status} id=${invRes.data?.value?.id}`);
  if (invRes.data?.value) {
    console.log(`  invoiceNumber=${invRes.data.value.invoiceNumber}`);
    console.log(`  amountExclVat=${invRes.data.value.amountExcludingVatCurrency}`);
    console.log(`  projectInvoiceDetails: ${JSON.stringify(invRes.data.value.projectInvoiceDetails)?.slice(0, 200)}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
