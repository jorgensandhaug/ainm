const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "6lfj_CH5oM2lJO406IzMMerYLSb-yk_ZdJ0eZ_7bw4E";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(b)); throw new Error(`GET ${path} ${r.status}`); }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(b)); throw new Error(`POST ${path} ${r.status}`); }
  return b;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(b)); throw new Error(`PUT ${path} ${r.status}`); }
  return b;
}

async function main() {
  // Already done from run1+run2:
  const customerId = 108423031;
  const projectId = 402036301;
  const suppId = 108423194;
  const acc6590Id = 472255170;
  const acc2400Id = 472254953;

  // Step 7: POST voucher (with row fields) + GET vatType + GET bank account (parallel)
  const [voucherRes, vatRes, bankRes] = await Promise.all([
    post("/ledger/voucher", {
      voucherType: { id: 11289239 },
      date: TODAY,
      description: "Leverandørkostnad Nordhav AS",
      postings: [
        {
          row: 1,
          account: { id: acc6590Id },
          amount: 95050,
          amountCurrency: 95050,
          amountGross: 95050,
          amountGrossCurrency: 95050,
          project: { id: projectId },
          date: TODAY,
          description: "Leverandørkostnad Nordhav AS",
        },
        {
          row: 2,
          account: { id: acc2400Id },
          amount: -95050,
          amountCurrency: -95050,
          amountGross: -95050,
          amountGrossCurrency: -95050,
          supplier: { id: suppId },
          date: TODAY,
          description: "Leverandørgjeld Nordhav AS",
        },
      ],
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  console.log("voucher:", voucherRes.value.id);

  const vatType = vatRes.values.find((v: any) => v.percentage === 25) || vatRes.values[0];
  console.log("vatType:", vatType.id, vatType.percentage);

  let bankAcct = bankRes.values.find((a: any) => a.bankAccountNumber) || bankRes.values[0];
  console.log("bankAcct:", bankAcct.id, "bankAccountNumber:", bankAcct.bankAccountNumber);

  // Step 8: if bank account lacks bankAccountNumber, PUT it
  if (!bankAcct.bankAccountNumber) {
    const fixRes = await put(`/ledger/account/${bankAcct.id}`, {
      ...bankAcct,
      bankAccountNumber: "12345678903",
    });
    bankAcct = fixRes.value;
    console.log("fixed bankAcct:", bankAcct.id, bankAcct.bankAccountNumber);
  }

  // Step 9: POST invoice
  const dueDate = new Date(Date.UTC(2026, 2, 21 + 30)).toISOString().slice(0, 10);
  const invoiceRes = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        project: { id: projectId },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "ERP-implementering Snøhetta",
            count: 1,
            unitPriceExcludingVatCurrency: 431600,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });
  console.log("invoice:", invoiceRes.value.id, "number:", invoiceRes.value.invoiceNumber);
  console.log("amountExcludingVat:", invoiceRes.value.amountExcludingVatCurrency);
  console.log("projectInvoiceDetails:", invoiceRes.value.projectInvoiceDetails?.length);
  console.log("DONE");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
