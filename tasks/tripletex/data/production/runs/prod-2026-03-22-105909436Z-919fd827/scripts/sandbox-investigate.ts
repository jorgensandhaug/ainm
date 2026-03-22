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
  // Investigation 1: Can we get paymentTypeId from the invoice itself?
  console.log("=== INVESTIGATION 1: Invoice fields with paymentType ===");
  const invoices: any = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=5&fields=*");
  if (invoices && invoices.length > 0) {
    const inv = invoices[0];
    console.log("Invoice keys:", Object.keys(inv).join(", "));
    // Check if paymentTypeId or similar is present
    console.log("paymentTypeId:", inv.paymentTypeId);
    console.log("payment:", inv.payment);
    console.log("paymentType:", inv.paymentType);
  }

  // Investigation 2: Can we expand postings with account info from the invoice?
  console.log("\n=== INVESTIGATION 2: Invoice postings with account expansion ===");
  const invWithPostings: any = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=1&fields=*,postings(account(*))");
  if (invWithPostings && invWithPostings.length > 0) {
    const inv = invWithPostings[0];
    if (inv.postings) {
      for (const p of inv.postings) {
        console.log(`  Posting: account ${p.account?.number} (id=${p.account?.id}), amount=${p.amount}`);
      }
    } else {
      console.log("No postings field on invoice");
    }
  }

  // Investigation 3: Check if GET /invoice supports paymentType expansion
  console.log("\n=== INVESTIGATION 3: Try paymentTypeGroup expansion ===");
  const invPT: any = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=1&fields=id,invoiceNumber,paymentTypeId");
  if (invPT) {
    console.log("With paymentTypeId field:", JSON.stringify(invPT[0] || invPT, null, 2));
  }

  // Investigation 4: Check if we can combine paymentType and account in one call
  console.log("\n=== INVESTIGATION 4: Try to get payment type from company settings ===");
  const companySettings: any = await api("GET", "/company/settings/altinn?fields=*");
  if (companySettings) {
    console.log("Company settings keys:", Object.keys(companySettings).join(", "));
  }

  // Investigation 5: Can we use PUT /invoice/:payment without paymentTypeId on sandbox?
  // (Already proven to fail, but let's reconfirm)
  console.log("\n=== INVESTIGATION 5: Confirm paymentTypeId is mandatory ===");
  // Get an overdue invoice
  const allInv: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=100&sorting=-invoiceDate&fields=id,invoiceNumber,invoiceDueDate,amountCurrencyOutstanding") || [];
  const overdue = allInv.filter((i: any) => i.invoiceDueDate < "2026-03-22" && (i.amountCurrencyOutstanding ?? 0) > 0);
  if (overdue.length > 0) {
    console.log(`Found ${overdue.length} overdue invoices, first: #${overdue[0].invoiceNumber} id=${overdue[0].id} outstanding=${overdue[0].amountCurrencyOutstanding}`);
  }
}

main().catch(e => console.error("FATAL:", e.message));
