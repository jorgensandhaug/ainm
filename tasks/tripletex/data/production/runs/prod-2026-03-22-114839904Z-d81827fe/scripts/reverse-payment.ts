const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IYmWcAoGxt7fHHFVsf5dTnXCUVOz86NECtBBoaMQc0k";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status} ${text}`);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Find the invoice for Luz do Sol Lda (962812384), "Sessão de formação", 41100 ex-VAT
  const invoices = await api("GET",
    "/invoice?customerOrgNumber=962812384&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))");

  // Filter by ex-VAT amount
  let target = invoices.length === 1 ? invoices[0] :
    invoices.find((inv: any) => inv.amountExcludingVatCurrency === 41100 || inv.amountExcludingVat === 41100);
  if (!target) throw new Error("Invoice not found");
  console.log("Target invoice:", target.id, "amountCurrency:", target.amountCurrency);

  // Extract payment voucher from postings
  const postings = target.postings || [];
  // Look for INCOMING_PAYMENT type first
  let paymentPosting = postings.find((p: any) =>
    p.type === "INCOMING_PAYMENT" || p.type === "INCOMING_PAYMENT_OPPOSITE");
  // Fallback: unique negative posting with "Betaling:" description
  if (!paymentPosting) {
    paymentPosting = postings.find((p: any) =>
      p.amountCurrency < 0 && p.description && p.description.includes("Betaling:"));
  }
  if (!paymentPosting) throw new Error("Payment posting not found");

  const paymentVoucherId = paymentPosting.voucher?.id || paymentPosting.voucherId;
  if (!paymentVoucherId) throw new Error("Payment voucher ID not found");
  console.log("Payment voucher ID:", paymentVoucherId);

  // Check not shared with invoice voucher
  const invoicePostings = postings.filter((p: any) =>
    (p.voucher?.id || p.voucherId) !== paymentVoucherId);
  if (invoicePostings.length === 0) throw new Error("Shared voucher - not standalone payment");

  // Step 2: Reverse the payment voucher
  const reversed = await api("PUT", `/ledger/voucher/${paymentVoucherId}/:reverse?date=${TODAY}`);
  console.log("Reverse voucher ID:", reversed.id);

  // Step 3: Verify (GET is free)
  await api("GET", `/invoice/${target.id}?fields=*,customer(*),orderLines(*),postings(*,voucher(*),account(*))`);
}

main().catch(e => { console.error(e); process.exit(1); });
