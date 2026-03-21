const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  let data;
  try { data = JSON.parse(text); } catch { console.log("Raw:", text); return null; }
  if (!res.ok) { console.log("Error:", JSON.stringify(data, null, 2)); return null; }
  return data;
}

// Step 1: Look up account IDs for 1920 (bank) and 8060 (agio)
const acctRes = await api("GET", "/ledger/account?number=1920,8060,1500&fields=id,number,name");
const accounts: Record<number, number> = {};
for (const a of acctRes?.values || []) {
  accounts[a.number] = a.id;
  console.log(`  Account ${a.number} (${a.name}): id=${a.id}`);
}

// Step 2: Find an existing unpaid NOK invoice, or use a specific known one
// Let's find an unpaid invoice
const invAll = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&fields=*,currency(*)");
const unpaid = (invAll?.values || []).filter((i: any) => i.amountOutstanding > 0 && i.currency?.code === "NOK");
console.log("\nUnpaid NOK invoices:", unpaid.length);

let testInvoice: any;
if (unpaid.length > 0) {
  testInvoice = unpaid[0];
  console.log(`Using existing unpaid invoice ${testInvoice.id}: amount=${testInvoice.amount} outstanding=${testInvoice.amountOutstanding}`);
} else {
  // Create one: need customer, order, invoice
  // Look up vatType first
  const vatRes = await api("GET", "/ledger/vatType?fields=id,name,number,percentage");
  console.log("\n=== VAT TYPES ===");
  let vatTypeId = 3;
  for (const v of (vatRes?.values || []).slice(0, 10)) {
    console.log(`  id=${v.id} number=${v.number} name=${v.name} pct=${v.percentage}`);
    if (v.percentage === 25 && v.number === 3) vatTypeId = v.id;
  }

  const custRes = await api("POST", "/customer", {
    name: "Sandbox Agio Test " + Date.now(),
    isCustomer: true,
  });
  const customerId = custRes?.value?.id;

  const orderRes = await api("POST", "/order", {
    customer: { id: customerId },
    orderDate: "2026-02-01",
    deliveryDate: "2026-02-01",
    orderLines: [{
      description: "Test line",
      count: 1,
      unitPriceExcludingVatCurrency: 18687,
      vatType: { id: vatTypeId },
    }],
  });
  const orderId = orderRes?.value?.id;

  if (orderId) {
    const invCreateRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-02-01&sendToCustomer=false`);
    const newInvId = invCreateRes?.value?.id;
    if (newInvId) {
      const readRes = await api("GET", `/invoice/${newInvId}?fields=*,currency(*)`);
      testInvoice = readRes?.value;
    }
  }
}

if (!testInvoice) {
  console.log("ERROR: No test invoice available");
  process.exit(1);
}

console.log(`\nTest invoice: id=${testInvoice.id} amount=${testInvoice.amount} outstanding=${testInvoice.amountOutstanding} exVat=${testInvoice.amountExcludingVat}`);

// Step 3: Pay the invoice (simple NOK payment)
const paymentTypeId = 32813748;
const payRes = await api("PUT",
  `/invoice/${testInvoice.id}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${testInvoice.amountOutstanding}`
);
console.log("\nPayment result - amountOutstanding:", payRes?.value?.amountOutstanding);

// Step 4: Post agio voucher
// Using ex-VAT amount: 18687 * (10.87 - 10.33) = 18687 * 0.54 = 10090.98
const agioAmount = Math.round(18687 * 0.54 * 100) / 100;
console.log("\nAgio amount:", agioAmount);

const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-03-21",
  description: "Valutagevinst (agio) - kursendring EUR/NOK",
  postings: [
    {
      row: 1,
      account: { id: accounts[1920] },
      amount: agioAmount,
      amountCurrency: agioAmount,
      amountGross: agioAmount,
      amountGrossCurrency: agioAmount,
      description: "Agio kursgevinst EUR",
    },
    {
      row: 2,
      account: { id: accounts[8060] },
      amount: -agioAmount,
      amountCurrency: -agioAmount,
      amountGross: -agioAmount,
      amountGrossCurrency: -agioAmount,
      description: "Agio kursgevinst EUR",
    },
  ],
});

if (voucherRes?.value) {
  console.log("\n=== AGIO VOUCHER CREATED ===");
  console.log("Voucher ID:", voucherRes.value.id);
  console.log("Number:", voucherRes.value.number);

  // Verify postings
  const postings = await api("GET", `/ledger/posting?voucherId=${voucherRes.value.id}&fields=*,account(id,number,name)`);
  console.log("\nVoucher postings:");
  for (const p of postings?.values || []) {
    console.log(`  Row ${p.row}: Account ${p.account?.number} (${p.account?.name}): amount=${p.amount}`);
  }
} else {
  console.log("VOUCHER CREATION FAILED");
}
