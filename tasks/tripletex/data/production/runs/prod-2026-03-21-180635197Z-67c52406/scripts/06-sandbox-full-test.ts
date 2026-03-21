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

// Step 1: Lookup account IDs for 1920 (bank) and 8060 (agio)
const acctRes = await api("GET", "/ledger/account?number=1920,8060&fields=id,number,name");
const accounts: Record<number, number> = {};
for (const a of acctRes?.values || []) {
  accounts[a.number] = a.id;
  console.log(`  Account ${a.number} (${a.name}): id=${a.id}`);
}

const bankAccountId = accounts[1920];
const agioAccountId = accounts[8060];
console.log("\nBank account ID:", bankAccountId);
console.log("Agio account ID:", agioAccountId);

// Step 2: Find an unpaid NOK invoice to test with
// Create a fresh test order+invoice
const custRes = await api("POST", "/customer", {
  name: "Sandbox Agio SL " + Date.now(),
  isCustomer: true,
});
const customerId = custRes?.value?.id;

// Get any available product
const prodList = await api("GET", "/product?count=1&fields=id,number,name");
const productId = prodList?.values?.[0]?.id;
console.log("Using product ID:", productId);

const orderRes = await api("POST", "/order", {
  customer: { id: customerId },
  orderDate: "2026-02-01",
  deliveryDate: "2026-02-01",
  orderLines: [{
    product: { id: productId },
    count: 1,
    unitPriceExcludingVatCurrency: 18687,
    vatType: { id: 3 },
  }],
});
const orderId = orderRes?.value?.id;

const invRes = await api("PUT", `/order/${orderId}/:invoice?invoiceDate=2026-02-01&sendToCustomer=false`);
const invoiceId = invRes?.value?.id;
console.log("Created invoice:", invoiceId);

// Read invoice
const readInv = await api("GET", `/invoice/${invoiceId}?fields=*,currency(*)`);
const inv = readInv?.value;
console.log("\n=== INVOICE STATE ===");
console.log("amount:", inv?.amount, "amountCurrency:", inv?.amountCurrency);
console.log("amountExcludingVat:", inv?.amountExcludingVat);
console.log("amountOutstanding:", inv?.amountOutstanding);
console.log("currency:", inv?.currency?.code);

// Step 3: Pay the invoice
const paymentTypeId = 32813748;
const payRes = await api("PUT",
  `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${paymentTypeId}&paidAmount=${inv?.amountOutstanding}`
);
console.log("\n=== PAYMENT ===");
console.log("amountOutstanding:", payRes?.value?.amountOutstanding);

// Step 4: Post agio voucher
// Agio = 18687 * (10.87 - 10.33) = 18687 * 0.54 = 10090.98
const agio = Math.round(18687 * 0.54 * 100) / 100;
console.log("\nAgio amount:", agio);

const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-03-21",
  description: "Valutagevinst (agio) - kursendring EUR/NOK",
  postings: [
    {
      date: "2026-03-21",
      account: { id: bankAccountId },
      amount: agio,
      description: "Agio kursgevinst EUR",
    },
    {
      date: "2026-03-21",
      account: { id: agioAccountId },
      amount: -agio,
      description: "Agio kursgevinst EUR",
    },
  ],
});
console.log("\n=== AGIO VOUCHER ===");
console.log(JSON.stringify(voucherRes?.value, null, 2));

// Verify: check the voucher postings
if (voucherRes?.value?.id) {
  const postings = await api("GET", `/ledger/posting?voucherId=${voucherRes.value.id}&fields=*,account(id,number,name)`);
  console.log("\n=== VOUCHER POSTINGS ===");
  for (const p of postings?.values || []) {
    console.log(`  Account ${p.account?.number} (${p.account?.name}): amount=${p.amount}`);
  }
}
