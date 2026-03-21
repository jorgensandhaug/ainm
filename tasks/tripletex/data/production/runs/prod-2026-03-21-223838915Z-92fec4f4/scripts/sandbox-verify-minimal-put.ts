const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

// Check current bank account state
const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
const accounts = acctRes.data.values || [];
const acct1920 = accounts.find((a: any) => a.number === 1920);
if (acct1920) {
  console.log("Account 1920 id:", acct1920.id);
  console.log("Current bankAccountNumber:", acct1920.bankAccountNumber);
  console.log("isInvoiceAccount:", acct1920.isInvoiceAccount);

  // Test minimal PUT payload (just bankAccountNumber)
  const putRes = await api("PUT", `/ledger/account/${acct1920.id}`, {
    bankAccountNumber: "12345678903",
  });
  console.log("Minimal PUT result:", putRes.status);
  if (putRes.status === 200) {
    console.log("Updated bankAccountNumber:", putRes.data?.value?.bankAccountNumber);
  }
} else {
  console.log("No account 1920 found among bank accounts");
  for (const a of accounts) {
    console.log(`  Account ${a.number}: id=${a.id}, bankAccountNumber=${a.bankAccountNumber}`);
  }
}

// Also verify: can we create an existing-customer invoice in sandbox without bank repair?
// This tests if the bank account is already configured from previous runs
const custRes = await api("GET", "/customer?organizationNumber=847830840&count=1&fields=*");
const customers = custRes.data.values || [];
if (customers.length > 0) {
  console.log("\nSandbox has customer 847830840, id:", customers[0].id);

  // Get VAT type
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatTypes = vatRes.data.values || [];
  console.log("Available VAT types:", vatTypes.map((v: any) => `${v.number}(${v.percentage}%)`).join(", "));

  // Sandbox only has 0% VAT, so we can't test 25% branch
  // But we can verify the 3-call happy path works when bank is configured
  const vat = vatTypes[0];
  if (vat) {
    const invRes = await api("POST", "/invoice?sendToCustomer=true", {
      invoiceDate: "2026-03-21",
      invoiceDueDate: "2026-04-20",
      customer: { id: customers[0].id },
      orders: [{
        customer: { id: customers[0].id },
        orderDate: "2026-03-21",
        deliveryDate: "2026-03-21",
        orderLines: [{
          description: "Nettverksteneste sandbox verify",
          count: 1,
          unitPriceExcludingVatCurrency: 7350,
          vatType: { id: vat.id },
        }],
      }],
    });
    if (invRes.status === 201) {
      const inv = invRes.data?.value;
      console.log("\nSandbox invoice created! (bank already configured → 3-call happy path works)");
      console.log("invoiceId:", inv?.id);
      console.log("amountExcludingVatCurrency:", inv?.amountExcludingVatCurrency);
      console.log("amountCurrency:", inv?.amountCurrency);
    } else {
      console.log("\nSandbox invoice failed - bank repair needed even here");
    }
  }
} else {
  console.log("\nNo customer 847830840 in sandbox");
}
