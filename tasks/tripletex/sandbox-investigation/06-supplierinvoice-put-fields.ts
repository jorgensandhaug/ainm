// Investigate: what fields can we PUT on supplierInvoice after import?
// And: can we approve/book the voucher via a different path?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

async function main() {
  // Look at an existing supplierInvoice and try various PUT operations
  const siRes = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-03-22&count=5&fields=*&sorting=id&order=desc");
  if (!siRes.data?.values?.length) {
    console.log("No SIs found for 2026-03-21");
    return;
  }

  const si = siRes.data.values[0];
  console.log("\nOriginal SI:", JSON.stringify(si, null, 2));

  // Try PUT /supplierInvoice/:addOrderLine
  console.log("\n=== Try adding order lines ===");
  const olRes = await api("GET", `/order/orderline/${si.orderLines[0].id}?fields=*`);
  console.log("Existing orderLine:", JSON.stringify(olRes.data?.value, null, 2).slice(0, 500));

  // Let me also check: is there a /supplierInvoice/voucher endpoint?
  console.log("\n=== Checking /supplierInvoice/voucher ===");
  const svRes = await api("GET", `/supplierInvoice/voucher?supplierInvoiceId=${si.id}&fields=*`);
  console.log("SI voucher:", JSON.stringify(svRes.data, null, 2).slice(0, 500));

  // Try PUT on the supplierInvoice itself
  console.log("\n=== PUT /supplierInvoice with paymentTypeId ===");
  // Check available payment types first
  const ptRes = await api("GET", "/supplierInvoice/paymentType?count=100&fields=*");
  console.log("Payment types:", JSON.stringify(ptRes.data?.values?.map((p: any) => ({id: p.id, description: p.description})), null, 2));

  // Try to PUT the SI with a payment type
  if (ptRes.data?.values?.length > 0) {
    const putRes = await api("PUT", `/supplierInvoice/${si.id}`, {
      id: si.id,
      version: si.version,
      invoiceNumber: si.invoiceNumber,
      invoiceDate: si.invoiceDate,
      invoiceDueDate: si.invoiceDueDate,
      supplier: { id: si.supplier.id },
      paymentTypeId: ptRes.data.values[0].id,
    });
    console.log("PUT result:", JSON.stringify(putRes.data, null, 2).slice(0, 500));
  }

  // Check POST /ledger/voucher/:sendToLedger (different from PUT with sendToLedger param)
  console.log("\n=== Try POST /ledger/voucher/:sendToLedger ===");
  const sendRes = await api("PUT", `/ledger/voucher/${si.voucher.id}/:sendToLedger`);
  console.log("sendToLedger result:", JSON.stringify(sendRes.data, null, 2).slice(0, 500));

  // Check POST /ledger/voucher/:nonPosted
  console.log("\n=== Try POST /ledger/voucher/:nonPosted ===");
  const npRes = await api("POST", `/ledger/voucher/${si.voucher.id}/:nonPosted`);

  // Check POST /ledger/voucher/:reverse
  console.log("\n=== Try GET /ledger/voucher/:options ===");
  const optRes = await api("GET", `/ledger/voucher/options?id=${si.voucher.id}&fields=*`);
  console.log("Options:", JSON.stringify(optRes.data, null, 2).slice(0, 500));

  // Also: explicitly check if voucher can be sent to ledger after postings exist
  // First, read the voucher with postings
  const vRes = await api("GET", `/ledger/voucher/${si.voucher.id}?fields=*,postings(*)`);
  console.log("\nVoucher:", JSON.stringify({
    id: vRes.data?.value?.id,
    number: vRes.data?.value?.number,
    numberAsString: vRes.data?.value?.numberAsString,
    postingsCount: vRes.data?.value?.postings?.length,
    postings: vRes.data?.value?.postings?.map((p: any) => ({
      row: p.row,
      account: `${p.account?.id}(${p.account?.number})`,
      amount: p.amount,
      amountGross: p.amountGross,
      systemGenerated: p.systemGenerated,
    })),
  }, null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
