const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Uhkx3-1ZQ_3SaKsjJJxS1SEPr0uMh1u3YA3JjsIsU_w";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(p: string) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const j = await r.json();
  console.log(`GET ${p} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(j)); throw new Error(`GET ${p} → ${r.status}`); }
  return j;
}

async function post(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`POST ${p} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(j));
  return { status: r.status, json: j };
}

async function put(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(`PUT ${p} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(j));
  return { status: r.status, json: j };
}

async function main() {
  // Step 1+2 parallel: resolve existing customer + outgoing VAT
  const [custRes, vatRes] = await Promise.all([
    get("/customer?organizationNumber=987928921&fields=*"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*"),
  ]);

  const cust = custRes.values?.[0];
  if (!cust) throw new Error("Customer not found");
  console.log(`Customer: id=${cust.id} name=${cust.name}`);

  const vat25 = (vatRes.values || []).find((v: any) => Number(v.percentage) === 25);
  if (!vat25) throw new Error("No 25% outgoing VAT found");
  console.log(`VAT 25%: id=${vat25.id}`);

  // Step 3: create + send invoice (sendToCustomer=true default)
  const payload = {
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    customer: { id: cust.id },
    orders: [{
      customer: { id: cust.id },
      orderDate: "2026-03-22",
      deliveryDate: "2026-03-22",
      orderLines: [{
        description: "Maintenance",
        count: 1,
        unitPriceExcludingVatCurrency: 40600,
        vatType: { id: vat25.id },
      }],
    }],
  };

  let res = await post("/invoice?sendToCustomer=true", payload);

  // Bank account repair if needed
  if (res.status === 422 && JSON.stringify(res.json).toLowerCase().includes("bank")) {
    console.log("Bank account repair...");
    const acctRes = await get("/ledger/account?isBankAccount=true&fields=*");
    const acct = (acctRes.values || []).find((a: any) => a.isInvoiceAccount) || acctRes.values?.[0];
    if (!acct) throw new Error("No bank account found");

    if (!acct.bankAccountNumber) {
      const pr = await put(`/ledger/account/${acct.id}`, { ...acct, bankAccountNumber: "12345678903" });
      if (pr.status !== 200) throw new Error("Bank repair failed");
    }

    // Retry with same payload
    res = await post("/invoice?sendToCustomer=true", payload);
  }

  if (res.status !== 201) throw new Error(`Invoice failed: ${res.status}`);

  const inv = res.json.value;
  console.log(`\nInvoice created: id=${inv.id} invoiceNumber=${inv.invoiceNumber}`);
  console.log(`amountExcludingVatCurrency=${inv.amountExcludingVatCurrency}`);
  console.log(`amountCurrency=${inv.amountCurrency}`);

  // Free verification GET
  const v = await get(`/invoice/${inv.id}?fields=*,customer(id,name,organizationNumber),orderLines(*),orders(*,orderLines(*))`);
  const vi = v.value;
  console.log(`\nVerification:`);
  console.log(`  invoiceNumber=${vi.invoiceNumber}`);
  console.log(`  amountExcludingVat=${vi.amountExcludingVatCurrency}`);
  console.log(`  amountCurrency=${vi.amountCurrency}`);
  console.log(`  customer=${vi.customer?.name} org=${vi.customer?.organizationNumber}`);
  console.log(`  isSent=${vi.isSent}`);
}

main().catch(e => { console.error(e); process.exit(1); });
