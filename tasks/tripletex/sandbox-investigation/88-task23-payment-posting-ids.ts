/**
 * 88-task23-payment-posting-ids.ts — Check if payment responses include posting IDs
 *
 * We need to know: after PUT /invoice/{id}/:payment, can we get the posting ID
 * on account 1920 from the response? Or do we need a separate GET /ledger/posting?
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, data: json };
}

async function main() {
  // Check what a customer payment response looks like
  // Find an invoice we can pay
  const invRes = await api("GET", "invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=10&fields=id,invoiceNumber,amountCurrencyOutstanding,customer(name)");
  const invoices = invRes.data?.values || [];

  // Find one with positive outstanding
  const payable = invoices.find((inv: any) => (inv.amountCurrencyOutstanding || 0) > 0);

  if (!payable) {
    console.log("No payable invoices found");

    // Just check what fields the invoice payment response has
    // by looking at a zero-outstanding invoice's payment voucher
    console.log("\n=== Check invoice payment response structure ===");
    // Look at the response from a previous payment
    // The key question: does PUT /invoice/{id}/:payment return posting IDs?
    // Let's check the response fields by looking at a recently paid invoice
    const paidInv = invoices.find((inv: any) => (inv.amountCurrencyOutstanding || 0) === 0);
    if (paidInv) {
      console.log("Found paid invoice:", paidInv.id);
      // Get its payment voucher
      const fullInv = await api("GET", `invoice/${paidInv.id}?fields=*`);
      console.log("Invoice fields:", Object.keys(fullInv.data?.value || {}));
      console.log("Payment voucher:", fullInv.data?.value?.paymentVoucher);

      if (fullInv.data?.value?.paymentVoucher?.id) {
        const voucherId = fullInv.data?.value?.paymentVoucher.id;
        const vRes = await api("GET", `ledger/voucher/${voucherId}?fields=*`);
        console.log("\nPayment voucher details:");
        const postings = vRes.data?.value?.postings || [];
        for (const p of postings) {
          console.log(`  Posting ${p.id}: account=${p.account?.id}, amount=${p.amount}, desc=${p.description?.slice(0, 60)}`);
        }
      }
    }

    // Actually, let's just query what the :payment response structure looks like
    // by checking the OpenAPI spec for the response
    console.log("\n=== Alternative: look at GET /ledger/posting for matching ===");

    // The real question is: can we match by looking at the posting returned by the voucher?
    // In the real task flow:
    // 1. PUT /invoice/{id}/:payment returns the invoice with updated fields
    //    BUT does it return the voucher ID or posting IDs?
    // 2. POST /ledger/voucher returns ALL posting IDs
    // 3. For matching, we need the posting ID on account 1920

    // The customer payment response returns the invoice object, not postings.
    // BUT we can get the payment voucher ID from invoice.paymentVoucher after payment.
    // Then we'd need to GET /ledger/voucher/{id}?fields=* to get posting IDs.
    // That's N extra GET calls for N customer payments.

    // BETTER: After all payments are done, do ONE:
    // GET /ledger/posting?accountId=<1920_id>&dateFrom=<first>&dateTo=<last>&count=1000&fields=*
    // This gives ALL 1920 postings. Match by amount.

    console.log("STRATEGY: One GET /ledger/posting call after all payments/vouchers");
    console.log("Match bank txns to postings by amount + date");
  } else {
    console.log("Found payable invoice:", payable.id, "outstanding:", payable.amountCurrencyOutstanding);

    // Get payment type
    const ptRes = await api("GET", "invoice/paymentType?count=100&fields=*,debitAccount(*)");
    const payType = (ptRes.data?.values || []).find((pt: any) => pt.debitAccount?.number === 1920);
    if (!payType) { console.log("No 1920 payment type"); return; }

    // Make a small payment
    const amount = Math.min(payable.amountCurrencyOutstanding, 100);
    console.log("Paying:", amount, "on invoice", payable.id, "with payType", payType.id);

    const payRes = await api("PUT", `invoice/${payable.id}/:payment?paymentDate=2026-11-20&paymentTypeId=${payType.id}&paidAmount=${amount}`);
    console.log("\nPayment response status:", payRes.status);
    console.log("Response keys:", Object.keys(payRes.data?.value || {}));

    // Check if the response includes posting/voucher info
    const val = payRes.data?.value;
    console.log("paymentVoucher:", val?.paymentVoucher);
    console.log("voucherId:", val?.voucherId);

    // The payment creates a voucher. Get its postings.
    if (val?.paymentVoucher?.id) {
      const vRes = await api("GET", `ledger/voucher/${val.paymentVoucher.id}?fields=*`);
      const postings = vRes.data?.value?.postings || [];
      console.log("\nPayment voucher postings:");
      for (const p of postings) {
        console.log(`  Posting ${p.id}: account.id=${p.account?.id}, amount=${p.amount}`);
      }

      // The posting on 1920 has the same amount as the payment
      const p1920 = postings.find((p: any) => p.account?.id === 424190862);
      console.log("\n1920 posting:", p1920?.id, "amount:", p1920?.amount);
    }
  }

  // ====== Test the single GET /ledger/posting approach ======
  console.log("\n=== Test: Get all recent 1920 postings in one call ===");
  const postRes = await api("GET", "ledger/posting?accountId=424190862&dateFrom=2026-11-01&dateTo=2026-11-30&count=100&fields=id,date,amount,description,voucher(id)");
  const postings = postRes.data?.values || [];
  console.log("1920 postings for Nov:", postings.length);
  for (const p of postings) {
    console.log(`  ${p.id}: date=${p.date}, amount=${p.amount}, desc=${p.description?.slice(0, 50)}, voucher=${p.voucher?.id}`);
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
