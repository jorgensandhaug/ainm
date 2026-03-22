/**
 * Sandbox test: Verify invoice number extraction and matching logic.
 * Tests whether Faktura XXXX in CSV descriptions maps to invoiceNumber in Tripletex.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string): Promise<any> {
  const url = `${BASE}/${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// Test the invoice number extraction regex against all known language variants
const testDescs = [
  "Innbetaling fra Moe AS / Faktura 1001",
  "Innbetaling fra Johansen AS / Faktura 1002",
  "Innbetaling fra Moe AS / Faktura 1003",
  "Payment from Lewis Ltd / Invoice 1005",
  "Einzahlung von Meyer GmbH / Rechnung 1003",
  "Pago de González SL / Factura 1002",
  "Pagamento de Sousa Lda / Fatura 1004",
  "Paiement de Dupont SA / Facture 1001",
  "Innbetaling frå Aasen AS / Faktura 1002",  // Nynorsk
  "Innbetaling fra Moe AS",  // No invoice ref - should return null
  "Bankgebyr",  // Non-invoice line
];

const refRegex = /(?:Faktura|Invoice|Rechnung|Fatura|Factura|Facture)\s+(\d+)/i;

console.log("=== Invoice reference extraction test ===");
for (const desc of testDescs) {
  const match = desc.match(refRegex);
  const refNum = match ? parseInt(match[1]) : null;
  console.log(`  "${desc}" → refNum=${refNum}`);
}

// Now test matching logic with the production scenario
console.log("\n=== Matching logic test (production scenario) ===");

interface MockInvoice {
  id: number;
  invoiceNumber: number;
  customerName: string;
  outstanding: number;
}

const invoices: MockInvoice[] = [
  { id: 1, invoiceNumber: 1, customerName: "Moe AS", outstanding: 7000 },
  { id: 2, invoiceNumber: 2, customerName: "Johansen AS", outstanding: 14500 },
  { id: 3, invoiceNumber: 3, customerName: "Moe AS", outstanding: 5250 },
  { id: 4, invoiceNumber: 4, customerName: "Nilsen AS", outstanding: 13250 },
  { id: 5, invoiceNumber: 5, customerName: "Nilsen AS", outstanding: 16562.5 },
];

const csvPayments = [
  { custName: "Moe AS", amount: 4200, desc: "Innbetaling fra Moe AS / Faktura 1001" },
  { custName: "Johansen AS", amount: 14500, desc: "Innbetaling fra Johansen AS / Faktura 1002" },
  { custName: "Moe AS", amount: 5250, desc: "Innbetaling fra Moe AS / Faktura 1003" },
  { custName: "Nilsen AS", amount: 13250, desc: "Innbetaling fra Nilsen AS / Faktura 1004" },
  { custName: "Nilsen AS", amount: 16562.5, desc: "Innbetaling fra Nilsen AS / Faktura 1005" },
];

// Track outstanding locally
const tracker: Record<number, number> = {};
for (const inv of invoices) tracker[inv.id] = inv.outstanding;

// OLD matching (current script - amount-based only)
console.log("\n--- OLD matching (amount-based) ---");
const oldTracker = { ...tracker };
for (const pay of csvPayments) {
  const candidates = invoices.filter(inv =>
    inv.customerName.toLowerCase().includes(pay.custName.toLowerCase()) && oldTracker[inv.id] > 0.01
  );
  let best = candidates.find(inv => Math.abs(oldTracker[inv.id] - pay.amount) < 0.01);
  if (!best) {
    const larger = candidates.filter(inv => oldTracker[inv.id] >= pay.amount - 0.01);
    larger.sort((a, b) => oldTracker[a.id] - oldTracker[b.id]);
    best = larger[0] || candidates.sort((a, b) => a.invoiceNumber - b.invoiceNumber)[0];
  }
  if (best) {
    const paid = Math.min(pay.amount, oldTracker[best.id]);
    oldTracker[best.id] -= paid;
    console.log(`  ${pay.desc} → inv #${best.invoiceNumber} (${best.outstanding}) paid=${paid} remaining=${oldTracker[best.id]}`);
  }
}

// NEW matching (invoice reference + amount fallback)
console.log("\n--- NEW matching (invoice reference + amount fallback) ---");
const newTracker = { ...tracker };
for (const pay of csvPayments) {
  const candidates = invoices.filter(inv =>
    inv.customerName.toLowerCase().includes(pay.custName.toLowerCase()) && newTracker[inv.id] > 0.01
  );

  let best: MockInvoice | undefined;

  // Try invoice reference matching first
  const refMatch = pay.desc.match(refRegex);
  if (refMatch) {
    const csvRef = parseInt(refMatch[1]);
    // Try direct match, then modulo 1000, then modulo 10000
    best = candidates.find(inv => inv.invoiceNumber === csvRef)
      || candidates.find(inv => inv.invoiceNumber === csvRef % 1000)
      || candidates.find(inv => inv.invoiceNumber === csvRef % 10000);
  }

  // Fall back to amount-based matching
  if (!best) {
    best = candidates.find(inv => Math.abs(newTracker[inv.id] - pay.amount) < 0.01);
    if (!best) {
      const larger = candidates.filter(inv => newTracker[inv.id] >= pay.amount - 0.01);
      larger.sort((a, b) => newTracker[a.id] - newTracker[b.id]);
      best = larger[0] || candidates.sort((a, b) => a.invoiceNumber - b.invoiceNumber)[0];
    }
  }

  if (best) {
    const paid = Math.min(pay.amount, newTracker[best.id]);
    newTracker[best.id] -= paid;
    console.log(`  ${pay.desc} → inv #${best.invoiceNumber} (${best.outstanding}) paid=${paid} remaining=${newTracker[best.id]}`);
  }
}

// Compare results
console.log("\n=== COMPARISON ===");
for (const inv of invoices) {
  const oldRemaining = oldTracker[inv.id];
  const newRemaining = newTracker[inv.id];
  const diff = Math.abs(oldRemaining - newRemaining) > 0.01 ? " ← DIFFERENT" : "";
  console.log(`  Inv #${inv.invoiceNumber} (${inv.customerName}): OLD remaining=${oldRemaining} NEW remaining=${newRemaining}${diff}`);
}

// Also check: what does sandbox have for invoices?
console.log("\n=== Sandbox invoice data ===");
const invRes = await api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=100&fields=id,invoiceNumber,amount,amountOutstanding,amountCurrencyOutstanding,customer(name)");
const invs = invRes.values || [];
console.log(`Sandbox invoices: ${invs.length}`);
for (const inv of invs.slice(0, 20)) {
  console.log(`  inv #${inv.invoiceNumber} | ${inv.customer?.name} | total=${inv.amount} outstanding=${inv.amountCurrencyOutstanding ?? inv.amountOutstanding}`);
}
