const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const res = await fetch(url, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  return { status: res.status, data: json };
}

async function main() {
  // 1. Verify sandbox VAT types for 2026-03-21
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatTypes = vatRes.data?.values || [];
  console.log("Sandbox outgoing VAT types:");
  for (const v of vatTypes) {
    console.log(`  code=${v.number} percentage=${v.percentage}% id=${v.id} name=${v.name}`);
  }

  // 2. Check if 25% exists in sandbox
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  console.log("25% VAT available:", !!vat25);

  // 3. Verify the existing-customer lookup pattern works
  const custRes = await api("GET", "/customer?organizationNumber=999280012&fields=id,name,organizationNumber");
  if (custRes.data?.values?.length) {
    console.log("Sandbox customer 999280012 found:", custRes.data.values[0].name, "id:", custRes.data.values[0].id);
  } else {
    console.log("Sandbox customer 999280012 not found");
  }

  // 4. Check bank account state
  const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=id,number,name,bankAccountNumber,isInvoiceAccount");
  const accounts = acctRes.data?.values || [];
  for (const a of accounts) {
    console.log(`  account ${a.number} id=${a.id} bank=${a.bankAccountNumber} isInvoice=${a.isInvoiceAccount}`);
  }
}

main();
