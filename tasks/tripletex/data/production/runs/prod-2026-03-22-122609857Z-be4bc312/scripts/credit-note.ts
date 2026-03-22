const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "YPTONPmfTG_Kk7YtI6lfUcoYDbaoiwgbK4DkUIxsKRQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(json)}`);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Locate the invoice
  const invoices = await api("GET",
    "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-23&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))");

  // Find matching invoice: org 829535181, description "Nettverksteneste", amount 15550, not credit note, not already credited
  const matches = invoices.filter((inv: any) => {
    if (inv.isCreditNote || inv.isCredited) return false;
    if (!inv.customer || inv.customer.organizationNumber !== "829535181") return false;
    if (Math.abs(inv.amountExcludingVatCurrency - 15550) > 0.01) return false;
    const descs: string[] = [];
    if (inv.orderLines) inv.orderLines.forEach((l: any) => { if (l.description) descs.push(l.description); });
    if (inv.orders) inv.orders.forEach((o: any) => {
      if (o.orderLines) o.orderLines.forEach((l: any) => { if (l.description) descs.push(l.description); });
    });
    return descs.some((d: string) => d === "Nettverksteneste");
  });

  if (matches.length === 0) throw new Error("No matching invoice found");

  // Pick highest id if duplicates
  const target = matches.sort((a: any, b: any) => b.id - a.id)[0];
  console.log(`\nTarget invoice: id=${target.id}, invoiceNumber=${target.invoiceNumber}, amount=${target.amountExcludingVatCurrency}`);

  // Step 2: Create credit note
  const creditNote = await api("PUT", `/invoice/${target.id}/:createCreditNote?date=2026-03-22&sendToCustomer=false`);
  console.log(`\nCredit note created: id=${creditNote.id}, invoiceNumber=${creditNote.invoiceNumber}, isCreditNote=${creditNote.isCreditNote}`);

  // Step 3: Verification GETs (free)
  await api("GET", `/invoice/${creditNote.id}?fields=id,invoiceNumber,isCreditNote,creditedInvoice,amountCurrency,amountExcludingVatCurrency,customer(id,name,organizationNumber)`);
  await api("GET", `/invoice/${target.id}?fields=id,invoiceNumber,isCredited`);
}

main().catch(e => { console.error(e); process.exit(1); });
