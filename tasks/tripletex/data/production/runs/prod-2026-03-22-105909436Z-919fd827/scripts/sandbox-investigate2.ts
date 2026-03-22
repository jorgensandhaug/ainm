const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const txt = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", txt.substring(0, 500));
    return null;
  }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Investigation: Can the first GET /invoice include enough data to skip the account GET?
  // Specifically: does fields=*,postings(account(*)) give us both 1500 AND 3400 account IDs?
  console.log("=== INVESTIGATION: Invoice postings detail ===");
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=5&fields=*,customer(*),postings(account(*))") || [];
  for (const inv of invoices.slice(0, 3)) {
    console.log(`\nInvoice #${inv.invoiceNumber} (id=${inv.id}):`);
    if (inv.postings) {
      for (const p of inv.postings) {
        console.log(`  account: ${p.account?.number} (id=${p.account?.id}), name=${p.account?.name}`);
      }
    }
  }

  // Investigation: Can we get paymentType from the invoice's voucher?
  console.log("\n=== INVESTIGATION: Invoice voucher detail ===");
  const invVoucher: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=1&fields=*,voucher(*)") || [];
  if (invVoucher.length > 0) {
    const v = invVoucher[0].voucher;
    if (v) {
      console.log("Voucher keys:", Object.keys(v).join(", "));
    }
  }

  // Investigation: What about GET /company with payment info?
  console.log("\n=== INVESTIGATION: Company info ===");
  const company: any = await api("GET", "/company?fields=*");
  if (company) {
    // Check for any payment-related fields
    const keys = Object.keys(company);
    const paymentKeys = keys.filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("bank"));
    console.log("Payment-related keys:", paymentKeys.join(", ") || "none");
  }

  // Investigation: Does the POST /invoice response include any payment type?
  // We can check a created invoice's full response
  console.log("\n=== INVESTIGATION: Created invoice response fields ===");
  // Check an existing invoice's full response for any payment-related info
  if (invoices.length > 0) {
    const fullInv: any = await api("GET", `/invoice/${invoices[0].id}?fields=*`);
    if (fullInv) {
      const keys = Object.keys(fullInv);
      const paymentKeys = keys.filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("type"));
      console.log("Payment/type-related keys:", paymentKeys.join(", ") || "none");
    }
  }

  // Investigation: Is there a way to query paymentTypes with fewer fields or from a different endpoint?
  console.log("\n=== INVESTIGATION: Payment type alternatives ===");
  // Check if there's a default payment type concept
  const pts: any[] = await api("GET", "/invoice/paymentType?count=5&fields=id,description,debitAccount(number,isBankAccount)") || [];
  for (const pt of pts) {
    console.log(`  PT id=${pt.id}, desc=${pt.description}, debitAccount=${pt.debitAccount?.number} (bank=${pt.debitAccount?.isBankAccount})`);
  }
}

main().catch(e => console.error("FATAL:", e.message));
