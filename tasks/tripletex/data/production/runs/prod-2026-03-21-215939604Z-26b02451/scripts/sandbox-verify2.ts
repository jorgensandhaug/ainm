const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

// Find a valid payment type
const ptR = await fetch(`${BASE}/ledger/paymentTypeOut?count=10&fields=*`, { headers: h });
const ptD = await ptR.json();
console.log("Payment types out:", ptR.status);
ptD.values?.forEach((pt: any) => console.log("  ", pt.id, pt.description));

// Also try incoming payment types (for customer invoice payment)
const ptR2 = await fetch(`${BASE}/ledger/paymentTypeOut?count=50&fields=*`, { headers: h });
const ptD2 = await ptR2.json();

// We need to use the :payment endpoint correctly
// Let's check what parameters it needs
// The invoice we created: 2147642910
const invR = await fetch(`${BASE}/invoice/2147642910?fields=*,postings(*)`, { headers: h });
const invD = await invR.json();
console.log("\nInvoice:", invR.status, "amount:", invD.value?.amountCurrency, "outstanding:", invD.value?.amountCurrencyOutstanding);

// Now try to pay with paymentTypeId from the list
if (ptD.values?.length) {
  const payTypeId = ptD.values[0].id;
  const amt = invD.value?.amountCurrency || 29500;
  console.log("\nTrying payment with paymentTypeId:", payTypeId, "amount:", amt);

  const payR = await fetch(`${BASE}/invoice/${invD.value?.id}/:payment?paymentDate=2026-03-21&paymentTypeId=${payTypeId}&paidAmount=${amt}&paidAmountCurrency=${amt}`, {
    method: "PUT",
    headers: h,
  });
  const payD = await payR.json();
  console.log("Payment:", payR.status, JSON.stringify(payD).slice(0, 500));
}
