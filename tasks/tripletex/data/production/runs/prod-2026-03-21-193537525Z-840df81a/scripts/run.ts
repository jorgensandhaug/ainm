const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "XTHRPLyEuyp2GjtatSNSEYu4wjCVikUnt4ownFpyOQc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const PROMPT_AMOUNT_EX_VAT = 18687; // EUR
const SETTLEMENT_RATE = 10.87; // NOK/EUR at payment time
const ORG_NR = "877276260";

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
    throw new Error(`${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  // Call 1: Locate the invoice
  const invRes = await api(
    "GET",
    `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`
  );
  const invoices = invRes.values || [];

  // Try to find foreign currency invoice first
  const foreignCandidates = invoices.filter(
    (inv: any) =>
      inv.currency?.code !== "NOK" &&
      inv.amountCurrencyOutstanding > 0 &&
      inv.amount !== inv.amountCurrency
  );

  let targetInvoice: any = null;
  let isForeignCurrency = false;

  // Match by ex-VAT amount in foreign currency
  for (const inv of foreignCandidates) {
    if (Math.abs(inv.amountExcludingVatCurrency - PROMPT_AMOUNT_EX_VAT) < 0.01) {
      targetInvoice = inv;
      isForeignCurrency = true;
      break;
    }
  }

  // NOK fallback
  if (!targetInvoice) {
    console.log("No foreign currency invoice found. Trying NOK fallback...");
    const nokCandidates = invoices.filter(
      (inv: any) => inv.amountOutstanding > 0
    );
    for (const inv of nokCandidates) {
      if (Math.abs(inv.amountExcludingVat - PROMPT_AMOUNT_EX_VAT) < 1) {
        targetInvoice = inv;
        isForeignCurrency = false;
        break;
      }
    }
  }

  if (!targetInvoice) {
    console.error("No matching invoice found!");
    console.log("All invoices:", JSON.stringify(invoices.map((i: any) => ({
      id: i.id,
      currency: i.currency?.code,
      amountExcludingVatCurrency: i.amountExcludingVatCurrency,
      amountExcludingVat: i.amountExcludingVat,
      amountCurrencyOutstanding: i.amountCurrencyOutstanding,
      amountOutstanding: i.amountOutstanding,
      amount: i.amount,
      amountCurrency: i.amountCurrency,
    })), null, 2));
    return;
  }

  console.log(`Found invoice: id=${targetInvoice.id}, currency=${targetInvoice.currency?.code}, outstanding=${targetInvoice.amountCurrencyOutstanding}`);

  // Call 2: Resolve payment type
  const ptRes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
  const paymentTypes = ptRes.values || [];

  let paymentType: any = null;
  // Priority 1: bank account 1900-1999 with isBankAccount
  paymentType = paymentTypes.find(
    (pt: any) =>
      pt.debitAccount?.number >= 1900 &&
      pt.debitAccount?.number < 2000 &&
      pt.debitAccount?.isBankAccount === true
  );
  // Priority 2: 1900-1999 without isBankAccount check
  if (!paymentType) {
    paymentType = paymentTypes.find(
      (pt: any) =>
        pt.debitAccount?.number >= 1900 && pt.debitAccount?.number < 2000
    );
  }
  // Priority 3: description includes "bank"
  if (!paymentType) {
    paymentType = paymentTypes.find((pt: any) =>
      pt.description?.toLowerCase().includes("bank")
    );
  }

  if (!paymentType) {
    console.error("No suitable payment type found!");
    return;
  }

  console.log(`Payment type: id=${paymentType.id}, desc=${paymentType.description}, account=${paymentType.debitAccount?.number}`);

  // Call 3: Register payment
  if (isForeignCurrency) {
    const paidAmountCurrency = targetInvoice.amountCurrencyOutstanding;
    const paidAmount = paidAmountCurrency * SETTLEMENT_RATE;
    console.log(`FX payment: ${paidAmountCurrency} EUR * ${SETTLEMENT_RATE} = ${paidAmount} NOK`);

    const payRes = await api(
      "PUT",
      `/invoice/${targetInvoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
    );
    console.log(`Payment result: outstandingCurrency=${payRes.value?.amountCurrencyOutstanding}, outstanding=${payRes.value?.amountOutstanding}`);
  } else {
    // Simple NOK payment
    const paidAmount = targetInvoice.amountOutstanding;
    console.log(`Simple NOK payment: ${paidAmount} NOK`);

    const payRes = await api(
      "PUT",
      `/invoice/${targetInvoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`
    );
    console.log(`Payment result: outstanding=${payRes.value?.amountOutstanding}`);
  }

  console.log("Done.");
}

main().catch(console.error);
