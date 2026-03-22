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
  console.log(`\n${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", txt);
    return null;
  }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 1. Check invoice fields - what's the correct "sent" field?
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=5&fields=*");
  if (invoices && invoices.length > 0) {
    console.log("\nInvoice field names:", Object.keys(invoices[0]).sort().join(", "));
    // Look for anything related to "send" or "sent"
    const sendFields = Object.keys(invoices[0]).filter(k =>
      k.toLowerCase().includes("send") || k.toLowerCase().includes("sent") || k.toLowerCase().includes("dispatch")
    );
    console.log("Send-related fields:", sendFields);
  }

  // 2. Check if paymentType can be extracted from the overdue invoice itself
  // Look at the invoice response for any paymentType reference
  if (invoices && invoices.length > 0) {
    const inv = invoices[0];
    const ptFields = Object.keys(inv).filter(k =>
      k.toLowerCase().includes("payment")
    );
    console.log("\nPayment-related fields on invoice:", ptFields);
    for (const f of ptFields) {
      console.log(`  ${f}:`, JSON.stringify(inv[f]));
    }
  }

  // 3. Try GET /invoice with customer(*) to see if customer has payment type embedded
  const invoicesWithCust: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=1&fields=*,customer(*)");
  if (invoicesWithCust && invoicesWithCust.length > 0) {
    const cust = invoicesWithCust[0].customer;
    if (cust) {
      const custPtFields = Object.keys(cust).filter(k =>
        k.toLowerCase().includes("payment")
      );
      console.log("\nCustomer payment-related fields:", custPtFields);
      for (const f of custPtFields) {
        console.log(`  ${f}:`, JSON.stringify(cust[f]));
      }
    }
  }

  // 4. Check if we can combine the invoice locate + account lookup in some way
  // Try: can we get account ids from the invoice's own postings?
  const invoicesWithPostings: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&count=1&fields=*,postings(account(id,number))");
  if (invoicesWithPostings && invoicesWithPostings.length > 0) {
    console.log("\nInvoice postings:", JSON.stringify(invoicesWithPostings[0].postings, null, 2));
    // Check if 1500 account id is in postings
    if (invoicesWithPostings[0].postings) {
      for (const p of invoicesWithPostings[0].postings) {
        if (p.account?.number === 1500) {
          console.log("Found 1500 account id in invoice postings:", p.account.id);
        }
        if (p.account?.number === 3400) {
          console.log("Found 3400 account id in invoice postings:", p.account.id);
        }
      }
    }
  }

  // 5. Try combining invoice + paymentType in one call? No - different endpoints.
  // But can we extract paymentType from the invoice's own fields?

  // 6. Try POST /ledger/voucher with account by number to double-check it still fails
  // (Already proven many times, skip)

  console.log("\n--- Investigation complete ---");
}

main().catch(e => { console.error(e); process.exit(1); });
