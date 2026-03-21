const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "XsofxoH5auLb8jeDSCm1kIKG4NdFbpNVRfpwKzc9_E4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

const PROMPT_EUR = 12301;
const ORIGINAL_RATE = 10.83;
const SETTLEMENT_RATE = 11.83;
const ORG_NR = "830993940";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  Status: ${r.status}`);
  if (!r.ok) {
    console.log(`  Error: ${JSON.stringify(json)}`);
    throw new Error(`API ${r.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  // Call 1: Locate the invoice
  const invoices = await api("GET",
    `/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)`
  );

  const allInv = invoices.values || [];
  console.log(`\nTotal invoices: ${allInv.length}`);

  // Try to find a foreign-currency invoice matching the prompt
  const fxCandidates = allInv.filter((inv: any) =>
    inv.currency?.code !== "NOK" &&
    inv.amountCurrencyOutstanding > 0 &&
    inv.amount !== inv.amountCurrency
  );
  console.log(`Foreign currency candidates with outstanding > 0: ${fxCandidates.length}`);

  // Match by amountExcludingVatCurrency
  let matched = fxCandidates.find((inv: any) =>
    Math.abs(inv.amountExcludingVatCurrency - PROMPT_EUR) < 0.01
  );
  // Also try matching amountCurrencyOutstanding directly
  if (!matched) {
    matched = fxCandidates.find((inv: any) =>
      Math.abs(inv.amountCurrencyOutstanding - PROMPT_EUR) < 0.01
    );
  }
  // Try with 25% VAT
  if (!matched) {
    matched = fxCandidates.find((inv: any) =>
      Math.abs(inv.amountCurrencyOutstanding - PROMPT_EUR * 1.25) < 0.01
    );
  }

  const isEurInvoice = !!matched;
  let invoice: any;

  if (isEurInvoice) {
    invoice = matched;
    console.log(`\nMatched EUR invoice: id=${invoice.id}, currency=${invoice.currency.code}`);
    console.log(`  amountCurrency=${invoice.amountCurrency}, amountCurrencyOutstanding=${invoice.amountCurrencyOutstanding}`);
    console.log(`  amount=${invoice.amount}, amountOutstanding=${invoice.amountOutstanding}`);
    console.log(`  amountExcludingVatCurrency=${invoice.amountExcludingVatCurrency}`);
  } else {
    // NOK fallback: find NOK invoice matching amountExcludingVat
    console.log(`\nNo foreign currency match. Looking for NOK invoice...`);
    const nokCandidates = allInv.filter((inv: any) =>
      inv.amountOutstanding > 0 &&
      (inv.currency?.code === "NOK" || inv.amount === inv.amountCurrency)
    );
    console.log(`NOK candidates with outstanding > 0: ${nokCandidates.length}`);

    // Match by amountExcludingVat (prompt EUR amount * original rate = NOK ex-VAT)
    const expectedNokExVat = PROMPT_EUR * ORIGINAL_RATE;
    matched = nokCandidates.find((inv: any) =>
      Math.abs(inv.amountExcludingVat - expectedNokExVat) < 1
    );
    if (!matched) {
      // Try direct EUR match on amountExcludingVat (invoice might store EUR amount as NOK)
      matched = nokCandidates.find((inv: any) =>
        Math.abs(inv.amountExcludingVat - PROMPT_EUR) < 0.01
      );
    }
    if (!matched && nokCandidates.length === 1) {
      matched = nokCandidates[0];
      console.log(`  Only one NOK candidate, using it.`);
    }
    if (!matched) {
      console.log(`  All NOK candidates:`);
      nokCandidates.forEach((inv: any) => {
        console.log(`    id=${inv.id} exVat=${inv.amountExcludingVat} outstanding=${inv.amountOutstanding} customer=${inv.customer?.id}`);
      });
      throw new Error("Could not match any invoice");
    }
    invoice = matched;
    console.log(`Matched NOK invoice: id=${invoice.id}, amountExcludingVat=${invoice.amountExcludingVat}, amountOutstanding=${invoice.amountOutstanding}`);
  }

  // Call 2: Resolve payment type
  const paymentTypes = await api("GET", `/invoice/paymentType?fields=*,debitAccount(*)`);
  const pts = paymentTypes.values || [];

  let pt = pts.find((p: any) =>
    p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000 && p.debitAccount?.isBankAccount === true
  );
  if (!pt) {
    pt = pts.find((p: any) =>
      p.debitAccount?.number >= 1900 && p.debitAccount?.number < 2000
    );
  }
  if (!pt) {
    pt = pts.find((p: any) =>
      p.description?.toLowerCase().includes("bank")
    );
  }
  if (!pt) throw new Error("No bank payment type found");
  console.log(`\nPayment type: id=${pt.id}, desc="${pt.description}", debitAccount=${pt.debitAccount?.number}`);

  if (isEurInvoice) {
    // EUR path: Call 3 — register payment with FX params
    const paidAmountCurrency = invoice.amountCurrencyOutstanding;
    const paidAmount = Math.round(paidAmountCurrency * SETTLEMENT_RATE * 100) / 100;
    console.log(`\nEUR payment: paidAmountCurrency=${paidAmountCurrency}, paidAmount=${paidAmount} (rate ${SETTLEMENT_RATE})`);

    const result = await api("PUT",
      `/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}&paidAmountCurrency=${paidAmountCurrency}`
    );
    console.log(`\nPayment result: amountOutstanding=${result.value?.amountOutstanding}, amountCurrencyOutstanding=${result.value?.amountCurrencyOutstanding}`);
    console.log("Done — FX gain/loss auto-booked by Tripletex.");
  } else {
    // NOK fallback path: Call 3 — simple payment
    const paidAmount = invoice.amountOutstanding;
    console.log(`\nNOK payment: paidAmount=${paidAmount}`);

    const payResult = await api("PUT",
      `/invoice/${invoice.id}/:payment?paymentDate=${DATE}&paymentTypeId=${pt.id}&paidAmount=${paidAmount}`
    );
    console.log(`Payment result: amountOutstanding=${payResult.value?.amountOutstanding}`);

    // Determine agio vs disagio
    const isAgio = SETTLEMENT_RATE > ORIGINAL_RATE;
    const agioAcctNum = isAgio ? 8060 : 8160;
    const agioAmount = Math.round(PROMPT_EUR * (SETTLEMENT_RATE - ORIGINAL_RATE) * 100) / 100;
    const absAgio = Math.abs(agioAmount);
    console.log(`\n${isAgio ? "Agio" : "Disagio"}: ${absAgio} NOK (rate diff: ${SETTLEMENT_RATE} - ${ORIGINAL_RATE} = ${SETTLEMENT_RATE - ORIGINAL_RATE})`);

    // Call 4: Look up account IDs
    const accounts = await api("GET", `/ledger/account?number=1920,${agioAcctNum}&fields=id,number`);
    const accts = accounts.values || [];
    const bankAcct = accts.find((a: any) => a.number === 1920);
    const agioAcct = accts.find((a: any) => a.number === agioAcctNum);
    if (!bankAcct || !agioAcct) throw new Error(`Missing accounts: bank=${bankAcct?.id}, agio=${agioAcct?.id}`);
    console.log(`Accounts: 1920 id=${bankAcct.id}, ${agioAcctNum} id=${agioAcct.id}`);

    // Call 5: Manual agio voucher
    const voucher = await api("POST", `/ledger/voucher?sendToLedger=true`, {
      date: DATE,
      description: isAgio ? "Valutagevinst (agio) - kursforskjell" : "Valutatap (disagio) - kursforskjell",
      postings: [
        {
          row: 1, date: DATE,
          account: { id: bankAcct.id },
          amountGross: absAgio, amountGrossCurrency: absAgio,
          vatType: { id: 0 },
          description: "Kursgevinst innbetaling"
        },
        {
          row: 2, date: DATE,
          account: { id: agioAcct.id },
          amountGross: -absAgio, amountGrossCurrency: -absAgio,
          vatType: { id: 0 },
          description: isAgio ? "Valutagevinst (agio)" : "Valutatap (disagio)"
        }
      ]
    });
    console.log(`\nVoucher created: id=${voucher.value?.id}`);
    console.log("Done — payment registered + manual agio booked.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
