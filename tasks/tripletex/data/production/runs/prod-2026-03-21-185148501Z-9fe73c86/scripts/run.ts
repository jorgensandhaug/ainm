const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "li9dWg1CVRyfMccEGRZOV4meKQq9Fk_eSoUnp64KvQU";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Customer and VAT already resolved from prior calls
  const customerId = 108397761;
  const vatTypeId = 3;

  const invoiceDate = "2026-03-21";
  const invoicePayload = {
    invoiceDate,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: [
          {
            description: "Heures de conseil",
            count: 1,
            unitPriceExcludingVatCurrency: 20000,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };

  let invRes = await api("POST", "invoice", invoicePayload);

  // Bank account repair branch
  if (invRes.status === 422) {
    const errMsg = JSON.stringify(invRes.data);
    if (errMsg.includes("bank") || errMsg.includes("konto")) {
      console.log("Bank account repair branch triggered");

      const acctRes = await api("GET", "ledger/account?isBankAccount=true&fields=*");
      const accounts = acctRes.data.values;
      const acct1920 = accounts.find((a: any) => a.number === 1920);
      if (!acct1920) {
        console.log("No 1920 account found, aborting");
        return;
      }
      const acctId = acct1920.id;
      console.log(`Account 1920 ID: ${acctId}`);

      await api("PUT", `ledger/account/${acctId}`, {
        id: acctId,
        number: 1920,
        name: acct1920.name,
        bankAccountNumber: "12345678903",
      });

      // Retry invoice - reuse customerId and vatTypeId
      invRes = await api("POST", "invoice", invoicePayload);
    }
  }

  if (invRes.status < 300) {
    const inv = invRes.data.value;
    console.log(`Invoice created: #${inv.invoiceNumber}, id=${inv.id}`);
    console.log(`Amount ex VAT: ${inv.amountExcludingVatCurrency}`);
    console.log(`Amount inc VAT: ${inv.amountCurrency}`);
  }
}

main().catch(console.error);
