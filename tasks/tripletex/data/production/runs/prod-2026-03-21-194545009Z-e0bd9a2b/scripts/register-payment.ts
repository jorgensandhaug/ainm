const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Mr7vzFR0Gurs5s-0DWoDvLHMjEQQaxPFRmNjbE3O6_c";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const DATE = "2026-03-21";
const PROMPT_AMOUNT = 12689; // EUR ex-VAT from prompt
const SETTLEMENT_RATE = 10.71; // NOK/EUR at payment time

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(body)); throw new Error(`GET failed ${r.status}`); }
  return body;
}

async function put(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  console.log(`PUT ${url}`);
  const r = await fetch(url, { method: "PUT", headers });
  const body = await r.json();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(body)); throw new Error(`PUT failed ${r.status}`); }
  return body;
}

async function main() {
  // Call 1: Locate the invoice
  const invRes = await get(`/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`);
  const invoices = invRes.values || [];
  console.log(`Found ${invoices.length} invoices total`);

  // Filter for foreign currency with outstanding > 0
  let fxCandidates = invoices.filter((inv: any) =>
    inv.currency?.code && inv.currency.code !== "NOK" &&
    inv.amountCurrencyOutstanding > 0 &&
    inv.amount !== inv.amountCurrency
  );
  console.log(`Foreign currency candidates with outstanding > 0: ${fxCandidates.length}`);

  let invoice: any = null;
  let isForeignCurrency = false;

  if (fxCandidates.length > 0) {
    // Match by prompt amount (ex-VAT)
    invoice = fxCandidates.find((inv: any) => inv.amountExcludingVatCurrency === PROMPT_AMOUNT);
    if (!invoice) {
      // Try matching amountCurrency directly
      invoice = fxCandidates.find((inv: any) => inv.amountCurrency === PROMPT_AMOUNT);
    }
    if (!invoice) {
      // Try matching with VAT (amount * 1.25)
      invoice = fxCandidates.find((inv: any) => inv.amountCurrency === PROMPT_AMOUNT * 1.25);
    }
    if (invoice) {
      isForeignCurrency = true;
      console.log(`Matched foreign currency invoice ID=${invoice.id}, currency=${invoice.currency.code}, amountCurrency=${invoice.amountCurrency}, amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}`);
    }
  }

  // NOK fallback
  if (!invoice) {
    console.log("No foreign currency match found, falling back to NOK invoices");
    const nokCandidates = invoices.filter((inv: any) =>
      inv.amountOutstanding > 0
    );
    invoice = nokCandidates.find((inv: any) => inv.amountExcludingVat === PROMPT_AMOUNT);
    if (!invoice) {
      invoice = nokCandidates.find((inv: any) => inv.amount === PROMPT_AMOUNT);
    }
    if (invoice) {
      console.log(`Matched NOK invoice ID=${invoice.id}, amountOutstanding=${invoice.amountOutstanding}`);
    }
  }

  if (!invoice) {
    // Log all invoices for debugging
    for (const inv of invoices) {
      console.log(`  Invoice ${inv.id}: currency=${inv.currency?.code}, amountCurrency=${inv.amountCurrency}, amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}, amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}, amount=${inv.amount}, amountOutstanding=${inv.amountOutstanding}`);
    }
    throw new Error("No matching invoice found");
  }

  // Call 2: Resolve payment type
  const ptRes = await get(`/invoice/paymentType?fields=*,debitAccount(*)`);
  const paymentTypes = ptRes.values || [];

  let paymentType = paymentTypes.find((pt: any) =>
    pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000 && pt.debitAccount?.isBankAccount === true
  );
  if (!paymentType) {
    paymentType = paymentTypes.find((pt: any) =>
      pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000
    );
  }
  if (!paymentType) {
    paymentType = paymentTypes.find((pt: any) =>
      pt.description?.toLowerCase().includes("bank")
    );
  }
  if (!paymentType) throw new Error("No suitable payment type found");
  console.log(`Payment type: ID=${paymentType.id}, desc=${paymentType.description}, debitAccount=${paymentType.debitAccount?.number}`);

  // Call 3: Register the payment
  if (isForeignCurrency) {
    const paidAmountCurrency = invoice.amountCurrencyOutstanding;
    const paidAmount = Math.round(paidAmountCurrency * SETTLEMENT_RATE * 100) / 100;
    console.log(`FX payment: paidAmount=${paidAmount} NOK, paidAmountCurrency=${paidAmountCurrency} ${invoice.currency.code}`);

    const payRes = await put(`/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`);
    console.log(`Payment result: amountOutstanding=${payRes.value?.amountOutstanding}, amountCurrencyOutstanding=${payRes.value?.amountCurrencyOutstanding}`);
  } else {
    // Simple NOK payment
    const paidAmount = invoice.amountOutstanding;
    console.log(`NOK payment: paidAmount=${paidAmount} NOK`);

    const payRes = await put(`/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`);
    console.log(`Payment result: amountOutstanding=${payRes.value?.amountOutstanding}`);
  }

  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
