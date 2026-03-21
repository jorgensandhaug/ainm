const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-q_4EIn57qBGFt9CqaSnbbseezwXF3gMpKBFB_91zq8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Known from previous calls
  const customerId = 108445073;
  const prodSchulungId = 84422788;    // number 2626
  const prodBeratungId = 84422789;    // number 7746
  const prodCloudId = 84422790;       // number 5675

  // Fetch VAT types (need the .id values)
  const vatRes = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatTypes = vatRes.data?.values || [];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  const vat15 = vatTypes.find((v: any) => v.percentage === 15);
  const vat0exempt = vatTypes.find((v: any) => v.percentage === 0 && Number(v.number) === 5);
  if (!vat25 || !vat15 || !vat0exempt) {
    console.log("ERROR: missing VAT types");
    console.log("Available:", vatTypes.map((v: any) => `code=${v.number} ${v.percentage}% id=${v.id}`));
    return;
  }
  console.log(`VAT: 25% id=${vat25.id}, 15% id=${vat15.id}, 0%exempt id=${vat0exempt.id}`);

  // Create invoice
  const invoiceDate = "2026-03-21";
  const invoicePayload = {
    invoiceDate,
    invoiceDueDate: invoiceDate,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      orderDate: invoiceDate,
      deliveryDate: invoiceDate,
      orderLines: [
        {
          description: "Schulung",
          product: { id: prodSchulungId },
          count: 1,
          unitPriceExcludingVatCurrency: 17300,
          vatType: { id: vat25.id },
        },
        {
          description: "Beratungsstunden",
          product: { id: prodBeratungId },
          count: 1,
          unitPriceExcludingVatCurrency: 12850,
          vatType: { id: vat15.id },
        },
        {
          description: "Cloud-Speicher",
          product: { id: prodCloudId },
          count: 1,
          unitPriceExcludingVatCurrency: 7050,
          vatType: { id: vat0exempt.id },
        },
      ],
    }],
  };

  let invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);

  // Bank account repair branch
  if (invRes.status === 422 && JSON.stringify(invRes.data).includes("bank")) {
    console.log("Bank account repair needed...");
    const acctRes = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    const accounts = acctRes.data?.values || [];
    const acct1920 = accounts.find((a: any) => a.number === 1920);
    if (!acct1920) { console.log("ERROR: no 1920 account"); return; }
    console.log(`Account 1920: id=${acct1920.id}`);
    await api("PUT", `/ledger/account/${acct1920.id}`, {
      id: acct1920.id, number: acct1920.number, name: acct1920.name,
      bankAccountNumber: "12345678903",
    });
    invRes = await api("POST", "/invoice?sendToCustomer=true", invoicePayload);
  }

  if (invRes.status === 201) {
    const inv = invRes.data?.value;
    console.log(`\nInvoice created: id=${inv?.id}, number=${inv?.invoiceNumber}`);
    console.log(`exVat=${inv?.amountExcludingVatCurrency}, total=${inv?.amountCurrency}`);
  }
}

main().catch(e => console.error(e));
