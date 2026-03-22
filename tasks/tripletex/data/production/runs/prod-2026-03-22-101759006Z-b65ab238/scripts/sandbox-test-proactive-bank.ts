const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Test 1: Check what bank account looks like
  console.log("=== Test 1: Check bank account state ===");
  const accts = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  if (accts.status === 200) {
    for (const a of accts.data.values) {
      console.log(`  Account ${a.number}: id=${a.id}, bankAccountNumber=${a.bankAccountNumber}, isInvoiceAccount=${a.isInvoiceAccount}`);
    }
  }

  // Test 2: Check if we can detect "needs repair" from the GET
  // If bankAccountNumber is null/empty, we know we need to set it before POST /invoice
  const invoiceAcct = accts.data.values?.find((a: any) => a.isInvoiceAccount);
  if (invoiceAcct) {
    console.log(`\nInvoice account: ${invoiceAcct.number}, bankAccountNumber=${JSON.stringify(invoiceAcct.bankAccountNumber)}`);
    const needsRepair = !invoiceAcct.bankAccountNumber;
    console.log(`Needs repair: ${needsRepair}`);
  }

  // Test 3: Check company settings for bank account
  console.log("\n=== Test 3: Company settings ===");
  const company = await api("GET", "/company?fields=*");
  if (company.status === 200) {
    const c = company.data.value;
    console.log(`  Company: ${c.name}`);
    console.log(`  organizationNumber: ${c.organizationNumber}`);
  }
}

main().catch(e => console.error(e));
