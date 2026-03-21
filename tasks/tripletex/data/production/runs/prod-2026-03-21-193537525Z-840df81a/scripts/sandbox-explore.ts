const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`  -> ${res.status}`);
  if (!res.ok) {
    console.log(`  ERROR: ${text}`);
    return null;
  }
  return JSON.parse(text);
}

async function main() {
  // 1. List all invoices with currency expansion
  console.log("=== ALL INVOICES ===");
  const invRes = await api("GET", `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`);
  if (invRes?.values) {
    for (const inv of invRes.values) {
      console.log(`  id=${inv.id} currency=${inv.currency?.code} exVat=${inv.amountExcludingVat} exVatCurrency=${inv.amountExcludingVatCurrency} amount=${inv.amount} amountCurrency=${inv.amountCurrency} outstanding=${inv.amountOutstanding} outstandingCurrency=${inv.amountCurrencyOutstanding} customer=${inv.customer?.id}`);
    }
  }

  // 2. List customers
  console.log("\n=== CUSTOMERS ===");
  const custRes = await api("GET", `/customer?fields=*`);
  if (custRes?.values) {
    for (const c of custRes.values) {
      console.log(`  id=${c.id} name=${c.name} orgNr=${c.organizationNumber}`);
    }
  }

  // 3. Check available currencies
  console.log("\n=== CURRENCIES ===");
  const currRes = await api("GET", `/currency?fields=*`);
  if (currRes?.values) {
    const eur = currRes.values.find((c: any) => c.code === "EUR");
    const nok = currRes.values.find((c: any) => c.code === "NOK");
    console.log(`  EUR: id=${eur?.id} code=${eur?.code}`);
    console.log(`  NOK: id=${nok?.id} code=${nok?.code}`);
  }

  // 4. Check payment types
  console.log("\n=== PAYMENT TYPES ===");
  const ptRes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
  if (ptRes?.values) {
    for (const pt of ptRes.values) {
      console.log(`  id=${pt.id} desc=${pt.description} acct=${pt.debitAccount?.number} isBankAcct=${pt.debitAccount?.isBankAccount}`);
    }
  }

  // 5. Check accounts 8060 and 8160
  console.log("\n=== AGIO ACCOUNTS ===");
  const acctRes = await api("GET", `/ledger/account?numberFrom=8050&numberTo=8170&fields=*`);
  if (acctRes?.values) {
    for (const a of acctRes.values) {
      console.log(`  number=${a.number} name=${a.name} id=${a.id}`);
    }
  }
}

main().catch(console.error);
