const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "9DsTraFAJImAdroioAgN-T-zpYbDbrKL1s-ZgsYHsWo";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, endpoint: string, body?: any) {
  const url = `${BASE}${endpoint}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${res.status} on ${method} ${endpoint}`);
  }
  return json;
}

async function main() {
  // Step 1: Create customer
  const custResp = await api("POST", "/customer", {
    name: "Fjelltopp AS",
    organizationNumber: "927173875",
    invoiceSendMethod: "MANUAL",
  });
  const customerId = custResp.value.id;
  console.log("Customer ID:", customerId);

  // Step 2: Resolve outgoing VAT for today
  const vatResp = await api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*");
  const vatRows = vatResp.values || [];
  console.log("VAT rows:", vatRows.map((v: any) => ({ id: v.id, code: v.number, pct: v.percentage })));

  // Need exact 25% row for "eksklusiv MVA"
  const vat25 = vatRows.find((v: any) => v.percentage === 25 || v.percentage === 25.0);
  if (!vat25) {
    console.error("BLOCKED: No 25% outgoing VAT row available in this account.");
    process.exit(1);
  }
  console.log("Using VAT type:", vat25.id, "code:", vat25.number, "pct:", vat25.percentage);

  // Step 3: Create and send invoice
  const invoicePayload = {
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-04",
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: "2026-03-21",
        deliveryDate: "2026-03-21",
        orderLines: [
          {
            description: "Nettverksteneste",
            count: 1,
            unitPriceExcludingVatCurrency: 42600,
            vatType: { id: vat25.id },
          },
        ],
      },
    ],
  };

  let invoiceResp: any;
  try {
    invoiceResp = await api("POST", "/invoice", invoicePayload);
  } catch (e: any) {
    // Check if bank account error
    if (e.message.includes("422") || e.message.includes("400")) {
      console.log("Invoice creation failed, checking for bank account issue...");
      // Bank account repair branch
      const acctResp = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
      const accounts = acctResp.values || [];
      const invoiceAcct = accounts.find((a: any) => a.isInvoiceAccount);
      if (!invoiceAcct) {
        console.error("BLOCKED: No invoice bank account found");
        process.exit(1);
      }
      console.log("Repairing bank account on account ID:", invoiceAcct.id, "number:", invoiceAcct.number);
      await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
        bankAccountNumber: "12345678903",
      });
      // Retry invoice
      invoiceResp = await api("POST", "/invoice", invoicePayload);
    } else {
      throw e;
    }
  }

  const inv = invoiceResp.value;
  console.log("\n=== INVOICE CREATED AND SENT ===");
  console.log("Invoice ID:", inv.id);
  console.log("Invoice Number:", inv.invoiceNumber);
  console.log("Amount excl VAT:", inv.amountExcludingVatCurrency);
  console.log("Amount incl VAT:", inv.amountCurrency);
  console.log("Customer:", inv.customer?.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
