// Sandbox test: verify whether voucher POST needs explicit row values
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

function parse(json: any) {
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", text.substring(0, 500));
    return { __error: true, status: res.status, body: text };
  }
  return parse(JSON.parse(text));
}

async function main() {
  // 1. Get accounts 1500 and 3400
  const accounts = await api("GET", "/ledger/account?number=1500,3400&fields=*") as any[];
  const acc1500 = accounts.find((a: any) => a.number === 1500);
  const acc3400 = accounts.find((a: any) => a.number === 3400);
  console.log(`Account 1500: id=${acc1500.id}, Account 3400: id=${acc3400.id}`);

  // 2. Get a customer id from an existing invoice
  const invoices = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-21&count=5&sorting=-invoiceDate&fields=*,customer(*)") as any[];
  const inv = invoices[0];
  const customerId = inv.customer.id;
  console.log(`Using customer id=${customerId} from invoice #${inv.invoiceNumber}`);

  // 3. Test voucher POST WITHOUT explicit row values
  console.log("\n--- TEST 1: voucher WITHOUT row values ---");
  const v1 = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Test no row",
    voucherType: null,
    postings: [
      {
        date: TODAY,
        account: { id: acc1500.id },
        customer: { id: customerId },
        currency: { id: 1 },
        amount: 10,
        amountCurrency: 10,
        amountGross: 10,
        amountGrossCurrency: 10,
      },
      {
        date: TODAY,
        account: { id: acc3400.id },
        currency: { id: 1 },
        amount: -10,
        amountCurrency: -10,
        amountGross: -10,
        amountGrossCurrency: -10,
      },
    ],
  });
  if ((v1 as any).__error) {
    console.log("RESULT: Voucher WITHOUT row FAILED");
  } else {
    console.log(`RESULT: Voucher WITHOUT row SUCCEEDED, id=${v1.id}`);
  }

  // 4. Test voucher POST WITH explicit row values
  console.log("\n--- TEST 2: voucher WITH row values ---");
  const v2 = await api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Test with row",
    voucherType: null,
    postings: [
      {
        row: 1,
        date: TODAY,
        account: { id: acc1500.id },
        customer: { id: customerId },
        currency: { id: 1 },
        amount: 10,
        amountCurrency: 10,
        amountGross: 10,
        amountGrossCurrency: 10,
      },
      {
        row: 2,
        date: TODAY,
        account: { id: acc3400.id },
        currency: { id: 1 },
        amount: -10,
        amountCurrency: -10,
        amountGross: -10,
        amountGrossCurrency: -10,
      },
    ],
  });
  if ((v2 as any).__error) {
    console.log("RESULT: Voucher WITH row FAILED");
  } else {
    console.log(`RESULT: Voucher WITH row SUCCEEDED, id=${v2.id}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
