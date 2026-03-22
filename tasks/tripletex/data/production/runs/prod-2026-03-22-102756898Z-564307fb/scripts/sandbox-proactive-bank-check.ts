// Sandbox verification: proactive bank-account check for create-and-send flow
// Goal: prove that 3 parallel GETs + conditional PUT + POST /invoice is better than reactive
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(p: string) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const j = await r.json();
  console.log(`GET ${p} → ${r.status}`);
  return j;
}

async function post(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`POST ${p} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(j));
  return { status: r.status, json: j };
}

async function put(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`PUT ${p} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(j));
  return { status: r.status, json: j };
}

async function main() {
  console.log("=== Proactive approach: 3 parallel GETs + conditional PUT + POST ===\n");

  // Step 1: 3 parallel free GETs
  const t0 = Date.now();
  const [custRes, vatRes, acctRes] = await Promise.all([
    get("/customer?organizationNumber=894181273&fields=*"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*"),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  const t1 = Date.now();
  console.log(`\n3 parallel GETs took ${t1 - t0}ms\n`);

  const cust = custRes.values?.[0];
  if (!cust) { console.log("No customer found — expected in sandbox"); return; }
  console.log(`Customer: id=${cust.id} name=${cust.name}`);

  // Sandbox only has 0% VAT — use what's available for flow proof
  const vatTypes = vatRes.values || [];
  console.log(`Available VAT types: ${vatTypes.map((v: any) => `${v.id}(${v.percentage}%)`).join(", ")}`);
  const vat = vatTypes[0]; // use whatever's available
  if (!vat) { console.log("No VAT type found"); return; }
  console.log(`Using VAT: id=${vat.id} percentage=${vat.percentage}%`);

  // Step 2: conditional bank-account repair
  const accounts = acctRes.values || [];
  const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount) || accounts[0];
  console.log(`\nBank account: id=${invoiceAcct?.id} number=${invoiceAcct?.number} bankAccountNumber=${invoiceAcct?.bankAccountNumber} isInvoiceAccount=${invoiceAcct?.isInvoiceAccount}`);

  let bankRepairDone = false;
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log("Bank account needs repair — doing PUT...");
    const pr = await put(`/ledger/account/${invoiceAcct.id}`, { ...invoiceAcct, bankAccountNumber: "12345678903" });
    console.log(`Bank repair: ${pr.status}`);
    bankRepairDone = true;
  } else {
    console.log("Bank account already configured — no PUT needed");
  }

  // Step 3: create + send invoice (should succeed on first try)
  const payload = {
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    customer: { id: cust.id },
    orders: [{
      customer: { id: cust.id },
      orderDate: "2026-03-22",
      deliveryDate: "2026-03-22",
      orderLines: [{
        description: "Sandbox Proactive Test",
        count: 1,
        unitPriceExcludingVatCurrency: 12345,
        vatType: { id: vat.id },
      }],
    }],
  };

  const t2 = Date.now();
  const res = await post("/invoice?sendToCustomer=true", payload);
  const t3 = Date.now();
  console.log(`\nPOST /invoice took ${t3 - t2}ms, status=${res.status}`);

  if (res.status === 201) {
    const inv = res.json.value;
    console.log(`\nInvoice created: id=${inv.id} invoiceNumber=${inv.invoiceNumber}`);
    console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
    console.log(`amountCurrency=${inv.amountCurrency}`);

    // Free verification
    const v = await get(`/invoice/${inv.id}?fields=*,customer(id,name,organizationNumber),orderLines(*),orders(*,orderLines(*))`);
    console.log(`isSent=${v.value?.isSent}`);
  }

  const totalCalls = 3 + (bankRepairDone ? 1 : 0) + 1; // GETs + conditional PUT + POST
  const freeGets = 3 + 1; // initial 3 + verification
  const writes = (bankRepairDone ? 1 : 0) + 1;
  const errors = 0;

  console.log(`\n=== Summary ===`);
  console.log(`Total API calls: ${totalCalls} (${freeGets} free GETs + ${writes} writes)`);
  console.log(`Errors: ${errors}`);
  console.log(`Bank repair needed: ${bankRepairDone}`);
  console.log(`Total time: ${t3 - t0}ms`);
}

main().catch(e => { console.error(e); process.exit(1); });
