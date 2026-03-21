const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); }
  return { status: r.status, data };
}

async function main() {
  // 1. Check currency id 1
  console.log("=== CURRENCY ID 1 ===");
  const currRes = await api("GET", "/currency/1?fields=*");
  console.log(JSON.stringify(currRes.data?.value, null, 2));

  // 2. Check company to understand base currency
  console.log("\n=== COMPANY ===");
  const compRes = await api("GET", "/company/1?fields=*");
  if (compRes.data?.value) {
    const c = compRes.data.value;
    console.log(`Company: ${c.name}, type: ${c.type}`);
  }

  // 3. Check the production invoice (Northwave Ltd / 883808568)
  console.log("\n=== INVOICE FOR 883808568 ===");
  const invRes = await api("GET", "/invoice?customerOrgNumber=883808568&invoiceDateFrom=2000-01-01&invoiceDateTo=2027-01-01&fields=*,currency(*),customer(*)");
  if (invRes.data?.values) {
    for (const i of invRes.data.values) {
      console.log(JSON.stringify({
        id: i.id, currency: i.currency,
        amount: i.amount, amountCurrency: i.amountCurrency,
        amountExcludingVat: i.amountExcludingVat,
        amountExcludingVatCurrency: i.amountExcludingVatCurrency,
        amountOutstanding: i.amountOutstanding,
        amountCurrencyOutstanding: i.amountCurrencyOutstanding,
        customer: i.customer?.name,
      }, null, 2));
    }
  }

  // 4. Check payment types with expanded debit accounts
  console.log("\n=== PAYMENT TYPES ===");
  const ptRes = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*),creditAccount(*)");
  if (ptRes.data?.values) {
    for (const p of ptRes.data.values) {
      console.log(JSON.stringify({
        id: p.id, description: p.description, name: p.name,
        isBankAccount: p.isBankAccount, isInvoiceAccount: p.isInvoiceAccount,
        currencyCode: p.currencyCode,
        debitAccount: p.debitAccount ? { number: p.debitAccount.number, name: p.debitAccount.name } : null
      }));
    }
  }

  // 5. Check postings on the production invoice to see if disagio was booked
  console.log("\n=== INVOICE VOUCHER POSTINGS ===");
  // The payment created posting 3845466993, let's check the voucher
  const postRes = await api("GET", "/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-22&count=100&fields=*,account(*),voucher(*)");
  if (postRes.data?.values) {
    for (const p of postRes.data.values) {
      console.log(JSON.stringify({
        id: p.id, amount: p.amount, amountGross: p.amountGross,
        account: p.account ? { number: p.account.number, name: p.account.name } : null,
        voucher: p.voucher ? { id: p.voucher.id, description: p.voucher.description } : null,
        description: p.description
      }));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
