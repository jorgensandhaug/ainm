const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "eKQJR5RpV-e9ZoCfato8k05fSD0xUaEgQErl7d1mZM4";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const TARGET_ORG = "962467210";
const TARGET_DESC = "Nettverkstjeneste";
const TARGET_AMOUNT = 41600;
const TODAY = "2026-03-21";

async function run() {
  // Step 1: Locate the invoice
  const getUrl = `${BASE}/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`;
  const getRes = await fetch(getUrl, { headers: { Authorization: AUTH } });
  if (!getRes.ok) {
    console.error("GET /invoice failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const data = await getRes.json();
  const invoices = data.values || [];

  // Find matching invoice
  const match = invoices.find((inv: any) => {
    if (inv.isCreditNote || inv.isCredited) return false;
    if (inv.customer?.organizationNumber !== TARGET_ORG) return false;
    if (inv.amountExcludingVatCurrency !== TARGET_AMOUNT) return false;
    // Check description in orderLines or orders.orderLines
    const topMatch = inv.orderLines?.some((ol: any) => ol.description === TARGET_DESC);
    const nestedMatch = inv.orders?.some((o: any) =>
      o.orderLines?.some((ol: any) => ol.description === TARGET_DESC)
    );
    return topMatch || nestedMatch;
  });

  if (!match) {
    console.error("No matching invoice found for", TARGET_ORG, TARGET_DESC, TARGET_AMOUNT);
    console.log("Available invoices:", JSON.stringify(invoices.map((i: any) => ({
      id: i.id,
      org: i.customer?.organizationNumber,
      amount: i.amountExcludingVatCurrency,
      isCreditNote: i.isCreditNote,
      isCredited: i.isCredited,
      orderLines: i.orderLines?.map((ol: any) => ol.description),
    })), null, 2));
    process.exit(1);
  }

  console.log("Found invoice:", match.id, "amount:", match.amountExcludingVatCurrency);

  // Step 2: Create credit note
  const putUrl = `${BASE}/invoice/${match.id}/:createCreditNote?date=${TODAY}&sendToCustomer=false`;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { Authorization: AUTH },
  });
  if (!putRes.ok) {
    console.error("PUT createCreditNote failed:", putRes.status, await putRes.text());
    process.exit(1);
  }
  const result = await putRes.json();
  console.log("Credit note created:");
  console.log("  ID:", result.value?.id);
  console.log("  Invoice number:", result.value?.invoiceNumber);
  console.log("  isCreditNote:", result.value?.isCreditNote);
  console.log("  creditedInvoice:", result.value?.creditedInvoice);
  console.log("  amountExcludingVatCurrency:", result.value?.amountExcludingVatCurrency);
}

run();
