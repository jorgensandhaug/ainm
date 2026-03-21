const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "4uTOYNIA-R9KGxUeC8Fey77Gp5IVSRoMyvzmu8fapJI";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) {
    console.log(`  ERROR: ${text}`);
    throw new Error(`${r.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  // Step 1: Find the unpaid EUR invoice for Montagne SARL (org 959783748)
  const invoiceRes = await api("GET",
    "/invoice?customerOrganizationNumber=959783748&currency=EUR&invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&fields=*"
  );

  const invoices = invoiceRes.values;
  console.log(`Found ${invoices.length} unpaid EUR invoice(s)`);

  if (!invoices || invoices.length === 0) {
    throw new Error("No unpaid EUR invoice found for org 959783748");
  }

  // Find the one matching 11660 EUR (could be ex-VAT, total with VAT would be 14575 at 25%)
  let invoice: any;
  if (invoices.length === 1) {
    invoice = invoices[0];
  } else {
    // Try exact match on outstanding or ex-VAT
    invoice = invoices.find((inv: any) =>
      inv.amountCurrencyOutstanding === 11660 ||
      inv.amountExcludingVatCurrency === 11660
    );
    if (!invoice) {
      // Tie-break by original rate
      invoice = invoices.find((inv: any) => {
        const impliedRate = inv.amount / inv.amountCurrency;
        return Math.abs(impliedRate - 10.98) < 0.05;
      });
    }
  }

  if (!invoice) throw new Error("Cannot isolate exact invoice");

  console.log(`Invoice ID: ${invoice.id}`);
  console.log(`  amountCurrency: ${invoice.amountCurrency}, amountCurrencyOutstanding: ${invoice.amountCurrencyOutstanding}`);
  console.log(`  amount: ${invoice.amount}, amountOutstanding: ${invoice.amountOutstanding}`);

  const invoiceId = invoice.id;
  const paidAmountCurrency = invoice.amountCurrencyOutstanding; // 11660 EUR

  // Step 2: Get payment type (incoming NOK bank)
  const ptRes = await api("GET", "/invoice/paymentType?fields=*");
  const paymentTypes = ptRes.values;

  // Find incoming NOK bank payment type
  // Try standard filter first, then fall back
  let pt = paymentTypes.find((p: any) =>
    p.isIncoming &&
    (p.isBankAccount || p.isInvoiceAccount) &&
    p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 &&
    (!p.currencyCode || p.currencyCode === "NOK")
  );

  if (!pt) {
    // Fallback: look for "Betalt til bank" or any NOK bank type
    pt = paymentTypes.find((p: any) =>
      p.description?.includes("bank") && (!p.currencyCode || p.currencyCode === "NOK")
    );
  }

  if (!pt) {
    // Last resort: just pick first NOK type
    pt = paymentTypes.find((p: any) => !p.currencyCode || p.currencyCode === "NOK");
  }

  if (!pt) {
    console.log("All payment types:", JSON.stringify(paymentTypes, null, 2));
    throw new Error("No suitable NOK payment type found");
  }

  console.log(`Payment type: ${pt.id} (${pt.description}), debit account: ${pt.debitAccount?.number}`);

  // Step 3: Register payment
  // paidAmountCurrency = full outstanding in invoice currency (EUR)
  // paidAmount = paidAmountCurrency * settlement rate (NOK)
  const settlementRate = 11.65;
  const paidAmount = paidAmountCurrency * settlementRate;

  console.log(`paidAmountCurrency: ${paidAmountCurrency} EUR`);
  console.log(`paidAmount: ${paidAmount} NOK (at ${settlementRate} NOK/EUR)`);

  const paymentRes = await api("PUT",
    `/invoice/${invoiceId}/:payment?paymentDate=2026-03-21&paymentTypeId=${pt.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
  );

  console.log("Payment response:", JSON.stringify(paymentRes, null, 2));
  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
