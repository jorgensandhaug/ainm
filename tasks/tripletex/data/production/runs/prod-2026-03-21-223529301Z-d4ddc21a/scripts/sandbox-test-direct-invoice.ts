// Sandbox test: Can POST /invoice replace POST /order + PUT /order/:invoice for fixed-price milestone?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Authorization": AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json();
  console.log("GET", path, r.status);
  if (!r.ok) { console.error(JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  return j;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  console.log("PUT", path, r.status);
  if (!r.ok) { console.error(JSON.stringify(j)); throw new Error(`PUT ${path} ${r.status}`); }
  return j;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("POST", path, r.status);
  if (!r.ok) { console.error(JSON.stringify(j, null, 2)); throw new Error(`POST ${path} ${r.status}`); }
  return j;
}

async function main() {
  // Step 1: Find an existing project to test with, or create one
  // First, let's find the existing sandbox projects
  const projRes = await get("/project?count=5&fields=*,customer(*)");
  console.log("Projects found:", projRes.count);

  let projectId: number;
  let customerId: number;

  if (projRes.count > 0) {
    // Use an existing project
    const p = projRes.values[0];
    projectId = p.id;
    customerId = p.customer?.id;
    console.log("Using existing project:", p.name, "id:", projectId, "customerId:", customerId);
    console.log("  fixedprice:", p.fixedprice, "isFixedPrice:", p.isFixedPrice);

    // Set it to fixed price if not already
    if (!p.isFixedPrice || p.fixedprice !== 170500) {
      const putRes = await put(`/project/${projectId}`, {
        name: p.name,
        startDate: p.startDate,
        customer: { id: customerId },
        projectManager: { id: p.projectManager?.id },
        isFixedPrice: true,
        fixedprice: 170500,
        invoiceOnAccountVatHigh: false,
      });
      console.log("Updated project fixedprice:", putRes.value?.fixedprice);
    }
  } else {
    console.log("No projects found, need to create fixture");
    return;
  }

  // Step 2: Get VAT type
  const vatRes = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatType = vatRes.values?.find((v: any) => v.percentage === 25) || vatRes.values?.[0];
  console.log("VAT type:", vatType?.id, "percentage:", vatType?.percentage);

  // Step 3: Try direct POST /invoice with embedded orders
  const milestoneAmt = 170500 * 0.33; // 56265
  console.log("\nTesting POST /invoice with embedded orders...");
  console.log("Milestone amount:", milestoneAmt);

  try {
    const invRes = await post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY,
      invoiceDueDate: TODAY,
      customer: { id: customerId },
      orders: [{
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [{
          description: "Milestone payment – 33% of fixed price",
          count: 1,
          unitPriceExcludingVatCurrency: milestoneAmt,
          vatType: { id: vatType.id },
        }],
      }],
    });
    console.log("\nSUCCESS! POST /invoice works for fixed-price milestone!");
    console.log("  invoiceId:", invRes.value?.id);
    console.log("  amountExcludingVatCurrency:", invRes.value?.amountExcludingVatCurrency);
    console.log("  amountCurrencyOutstanding:", invRes.value?.amountCurrencyOutstanding);
    console.log("  projectInvoiceDetails:", JSON.stringify(invRes.value?.projectInvoiceDetails));
  } catch (e) {
    console.log("\nFAILED: POST /invoice does not work for this case");
    console.log("Falling back to POST /order + PUT /order/:invoice");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
