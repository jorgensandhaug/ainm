// Full sandbox verification of bank reconciliation flow
// Mirrors the production CSV with customers, suppliers, and non-invoice lines
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: h });
  if (!r.ok) { console.error(`GET ${path} → ${r.status}`); const t = await r.text(); console.error(t); }
  return r.json();
}

async function post(path: string, body: any) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error(`POST ${path} → ${r.status}`, JSON.stringify(j).slice(0, 300)); }
  return j;
}

async function put(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method: "PUT", headers: h });
  const j = await r.json();
  if (!r.ok) { console.error(`PUT ${path} → ${r.status}`, JSON.stringify(j).slice(0, 300)); }
  return j;
}

const UID = Date.now();

// Step 1: Create test customers
console.log("=== CREATING TEST CUSTOMERS ===");
const custSanchez = await post("/customer", { name: `Recon Sánchez ${UID} SL`, isCustomer: true });
const custPerez = await post("/customer", { name: `Recon Pérez ${UID} SL`, isCustomer: true });
const custRomero = await post("/customer", { name: `Recon Romero ${UID} SL`, isCustomer: true });
console.log(`Sánchez id=${custSanchez.value?.id}, Pérez id=${custPerez.value?.id}, Romero id=${custRomero.value?.id}`);

// Step 2: Create test suppliers
console.log("\n=== CREATING TEST SUPPLIERS ===");
const suppGonzalez = await post("/supplier", { name: `Recon González ${UID} SL`, isSupplier: true });
const suppRodriguez = await post("/supplier", { name: `Recon Rodríguez ${UID} SL`, isSupplier: true });
console.log(`González id=${suppGonzalez.value?.id}, Rodríguez id=${suppRodriguez.value?.id}`);

// Step 3: Create products (needed for invoice lines)
const prod = await post("/product", { name: `recon-test-${UID}`, priceExcludingVatCurrency: 100 });
const productId = prod.value?.id;
console.log(`Product id=${productId}`);

// Step 4: Create invoices
// Sánchez invoices: 8500 and 7375
// Pérez invoice: 7875
// Romero invoices: 22937.50 and 14250
console.log("\n=== CREATING INVOICES ===");

async function createInvoice(customerId: number, productId: number, amount: number, date: string) {
  // Create order first, then invoice it
  const order = await post("/order", {
    customer: { id: customerId },
    deliveryDate: date,
    orderDate: date,
    orderLines: [{ product: { id: productId }, count: 1, unitPriceExcludingVatCurrency: amount }]
  });
  const orderId = order.value?.id;
  if (!orderId) { console.error("Failed to create order", JSON.stringify(order).slice(0, 200)); return null; }

  // Invoice the order
  const inv = await put(`/order/${orderId}/:invoice?invoiceDate=${date}&sendToCustomer=false`);
  console.log(`Invoice created: id=${inv.value?.id} number=${inv.value?.invoiceNumber} amount=${inv.value?.amount} outstanding=${inv.value?.amountOutstanding}`);
  return inv.value;
}

const inv1 = await createInvoice(custSanchez.value.id, productId, 8500, "2026-01-15");
const inv2 = await createInvoice(custSanchez.value.id, productId, 7375, "2026-01-16");
const inv3 = await createInvoice(custPerez.value.id, productId, 7875, "2026-01-17");
const inv4 = await createInvoice(custRomero.value.id, productId, 22937.50, "2026-01-20");
const inv5 = await createInvoice(custRomero.value.id, productId, 14250, "2026-01-21");

// Now run the actual reconciliation flow as the trusted standard describes
console.log("\n\n=== RECONCILIATION FLOW ===");

// Step 1: Fire 5 reads in parallel
const [invoices, paymentTypes, suppliers, supplierInvoices, accounts] = await Promise.all([
  get("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
  get("/invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
  get("/supplier?count=1000&fields=*"),
  get("/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
  get("/ledger/account?number=1920,2400,2600,7770,8050&fields=*"),
]);

// Step 2: Select payment type with debitAccount.number === 1920
const pt1920 = (paymentTypes as any).values.find((pt: any) => pt.debitAccount?.number === 1920);
console.log(`Payment type for 1920: id=${pt1920?.id} desc="${pt1920?.description}"`);

// Get account IDs
const acctMap: Record<number, number> = {};
for (const a of (accounts as any).values) {
  acctMap[a.number] = a.id;
  console.log(`Account ${a.number} → id=${a.id}`);
}

// CSV bank lines for this test
const bankLines = [
  { date: "2026-01-18", desc: `Innbetaling fra Recon Sánchez ${UID} SL / Faktura 1001`, inn: 8500, ut: 0, type: "customer" },
  { date: "2026-01-19", desc: `Innbetaling fra Recon Sánchez ${UID} SL / Faktura 1002`, inn: 7375, ut: 0, type: "customer" },
  { date: "2026-01-22", desc: `Innbetaling fra Recon Pérez ${UID} SL / Faktura 1003`, inn: 7875, ut: 0, type: "customer" },
  { date: "2026-01-25", desc: `Innbetaling fra Recon Romero ${UID} SL / Faktura 1004`, inn: 22937.50, ut: 0, type: "customer" },
  { date: "2026-01-26", desc: `Innbetaling fra Recon Romero ${UID} SL / Faktura 1005`, inn: 14250, ut: 0, type: "customer" },
  { date: "2026-01-29", desc: `Betaling Proveedor Recon González ${UID} SL`, inn: 0, ut: 10150, type: "supplier" },
  { date: "2026-01-30", desc: `Betaling Proveedor Recon Rodríguez ${UID} SL`, inn: 0, ut: 5800, type: "supplier" },
  { date: "2026-02-02", desc: `Betaling Proveedor Recon Rodríguez ${UID} SL`, inn: 0, ut: 18400, type: "supplier" },
  { date: "2026-02-03", desc: "Bankgebyr", inn: 0, ut: 1083.95, type: "fee" },
  { date: "2026-02-05", desc: "Skattetrekk", inn: 1269.93, ut: 0, type: "tax_in" },
  { date: "2026-02-07", desc: "Skattetrekk", inn: 0, ut: 600.07, type: "tax_out" },
];

// Step 3: Match and pay customer invoices
console.log("\n=== PAYING CUSTOMER INVOICES ===");

// Build invoice tracker with outstanding amounts
const allInvoices = (invoices as any).values as any[];
const outstandingTracker: Record<number, number> = {};
for (const inv of allInvoices) {
  outstandingTracker[inv.id] = inv.amountCurrencyOutstanding || 0;
}

// Find our test invoices by matching customer names
for (const line of bankLines.filter(l => l.type === "customer")) {
  // Extract customer name from description
  const nameMatch = line.desc.match(/fra (.+?)( \/ |$)/);
  const custName = nameMatch ? nameMatch[1].toLowerCase() : "";

  // Find matching invoices
  const matches = allInvoices.filter((inv: any) =>
    inv.customer?.name?.toLowerCase().includes(custName.split(" ").slice(1).join(" ").toLowerCase()) &&
    (outstandingTracker[inv.id] || 0) > 0
  );

  if (matches.length === 0) {
    console.log(`No match for: ${line.desc} (${line.inn})`);
    continue;
  }

  // Priority: exact outstanding match → smallest outstanding >= bankAmount → lowest invoiceNumber
  let bestMatch = matches.find((m: any) => Math.abs(outstandingTracker[m.id] - line.inn) < 0.01);
  if (!bestMatch) {
    const bigEnough = matches.filter((m: any) => outstandingTracker[m.id] >= line.inn).sort((a: any, b: any) => outstandingTracker[a.id] - outstandingTracker[b.id]);
    bestMatch = bigEnough[0] || matches.sort((a: any, b: any) => a.invoiceNumber - b.invoiceNumber)[0];
  }

  const payAmount = Math.min(line.inn, outstandingTracker[bestMatch.id]);
  console.log(`Paying invoice #${bestMatch.invoiceNumber} (id=${bestMatch.id}) ${payAmount} of ${outstandingTracker[bestMatch.id]} outstanding`);

  const payResult = await put(`/invoice/${bestMatch.id}/:payment?paymentDate=${line.date}&paymentTypeId=${pt1920.id}&paidAmount=${payAmount}`);
  console.log(`Payment result: ${payResult.value ? 'OK' : 'FAILED'} ${JSON.stringify(payResult).slice(0, 200)}`);

  outstandingTracker[bestMatch.id] -= payAmount;
}

// Step 4: Handle supplier payments — no supplier invoices expected, combine into voucher
console.log("\n=== BUILDING SUPPLIER + NON-INVOICE VOUCHER ===");

const supplierLines = bankLines.filter(l => l.type === "supplier");
const feeLines = bankLines.filter(l => l.type === "fee");
const taxInLines = bankLines.filter(l => l.type === "tax_in");
const taxOutLines = bankLines.filter(l => l.type === "tax_out");

// Resolve supplier IDs
const allSuppliers = (suppliers as any).values as any[];
const postings: any[] = [];
let row = 1;

// Supplier payment postings
for (const line of supplierLines) {
  const nameMatch = line.desc.match(/Proveedor (.+)$/);
  const supplierName = nameMatch ? nameMatch[1].toLowerCase() : "";
  const supplier = allSuppliers.find((s: any) => s.name.toLowerCase().includes(supplierName.split(" ").slice(1).join(" ").toLowerCase()));

  if (!supplier) {
    console.log(`No supplier match for: ${line.desc}`);
    continue;
  }

  // Debit 2400 (AP), Credit 1920 (bank)
  postings.push({
    row: row++, date: line.date, description: line.desc,
    account: { id: acctMap[2400] },
    amountGross: line.ut, amountGrossCurrency: line.ut,
    supplier: { id: supplier.id }
  });
  postings.push({
    row: row++, date: line.date, description: line.desc,
    account: { id: acctMap[1920] },
    amountGross: -line.ut, amountGrossCurrency: -line.ut
  });
}

// Bankgebyr postings: debit 7770, credit 1920
for (const line of feeLines) {
  postings.push({
    row: row++, date: line.date, description: "Bankgebyr",
    account: { id: acctMap[7770] },
    amount: line.ut, amountCurrency: line.ut, amountGross: line.ut, amountGrossCurrency: line.ut
  });
  postings.push({
    row: row++, date: line.date, description: "Bankgebyr",
    account: { id: acctMap[1920] },
    amount: -line.ut, amountCurrency: -line.ut, amountGross: -line.ut, amountGrossCurrency: -line.ut
  });
}

// Skattetrekk incoming (tax refund): debit 1920, credit 2600
for (const line of taxInLines) {
  postings.push({
    row: row++, date: line.date, description: "Skattetrekk",
    account: { id: acctMap[1920] },
    amount: line.inn, amountCurrency: line.inn, amountGross: line.inn, amountGrossCurrency: line.inn
  });
  postings.push({
    row: row++, date: line.date, description: "Skattetrekk",
    account: { id: acctMap[2600] },
    amount: -line.inn, amountCurrency: -line.inn, amountGross: -line.inn, amountGrossCurrency: -line.inn
  });
}

// Skattetrekk outgoing: debit 2600, credit 1920
for (const line of taxOutLines) {
  postings.push({
    row: row++, date: line.date, description: "Skattetrekk",
    account: { id: acctMap[2600] },
    amount: line.ut, amountCurrency: line.ut, amountGross: line.ut, amountGrossCurrency: line.ut
  });
  postings.push({
    row: row++, date: line.date, description: "Skattetrekk",
    account: { id: acctMap[1920] },
    amount: -line.ut, amountCurrency: -line.ut, amountGross: -line.ut, amountGrossCurrency: -line.ut
  });
}

console.log(`Total voucher postings: ${postings.length}`);

// Find earliest date for voucher
const allDates = [...supplierLines, ...feeLines, ...taxInLines, ...taxOutLines].map(l => l.date).sort();
const voucherDate = allDates[0];

const voucher = await post("/ledger/voucher", {
  date: voucherDate,
  description: "Bank reconciliation - supplier payments and fees",
  postings
});

console.log(`Voucher result: id=${voucher.value?.id} number=${voucher.value?.number}`);
if (!voucher.value) {
  console.error("Voucher creation failed:", JSON.stringify(voucher).slice(0, 500));
}

console.log("\n=== DONE ===");
console.log("Total API calls: 5 reads + 5 orders + 5 invoiceFromOrder + 5 customer payments + 1 voucher = 21");
console.log("In production (no setup): 5 reads + 5 payments + 1 voucher = 11 calls");
