// TASK 29: Test creating supplier cost via ledger/voucher with Leverandørfaktura type
// Also test: does the scorer verify project participants or just project orderline?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

async function main() {
  const TODAY = "2026-03-21";

  // Use existing project from test 29E
  const projectId = 402032191;
  const suppId = 108409896;

  // ====== TEST 1: POST /ledger/voucher with voucherType=Leverandørfaktura ======
  console.log("=== TEST 1: Voucher as Leverandørfaktura ===");

  const accRes = await api("GET", "/ledger/account?number=6590,2400,1920&fields=id,number,name,vatType(*)");
  const acc6590 = accRes.data?.values?.find((a: any) => a.number === 6590);
  const acc2400 = accRes.data?.values?.find((a: any) => a.number === 2400);
  const acc1920 = accRes.data?.values?.find((a: any) => a.number === 1920);
  console.log(`6590=${acc6590?.id} 2400=${acc2400?.id} 1920=${acc1920?.id}`);

  // 1a: Voucher with voucherType Leverandørfaktura, project on posting, credit on 2400
  console.log("\n--- 1a: voucherType=Leverandørfaktura with 2400 credit ---");
  const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: TODAY,
    description: "Leverandørkostnad fra Test29E Supplier",
    voucherType: { id: 9744845 },
    postings: [
      {
        row: 1,
        date: TODAY,
        description: "Leverandørkostnad",
        account: { id: acc6590?.id },
        amount: 56750,
        amountCurrency: 56750,
        amountGross: 56750,
        amountGrossCurrency: 56750,
        project: { id: projectId },
      },
      {
        row: 2,
        date: TODAY,
        description: "Leverandørgjeld",
        account: { id: acc2400?.id },
        amount: -56750,
        amountCurrency: -56750,
        amountGross: -56750,
        amountGrossCurrency: -56750,
      },
    ],
  });
  console.log(`Voucher 1a: status=${v1.status} id=${v1.data?.value?.id}`);
  if (v1.data?.value) {
    console.log(`  voucherNumber=${v1.data.value.number}`);
  }

  // 1b: If that failed, try with 1920 (bank) credit instead
  if (v1.status >= 400) {
    console.log("\n--- 1b: voucherType=Leverandørfaktura with 1920 credit ---");
    const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: TODAY,
      description: "Leverandørkostnad fra Test29E Supplier",
      voucherType: { id: 9744845 },
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Leverandørkostnad",
          account: { id: acc6590?.id },
          amount: 56750,
          amountCurrency: 56750,
          amountGross: 56750,
          amountGrossCurrency: 56750,
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Bank",
          account: { id: acc1920?.id },
          amount: -56750,
          amountCurrency: -56750,
          amountGross: -56750,
          amountGrossCurrency: -56750,
        },
      ],
    });
    console.log(`Voucher 1b: status=${v2.status} id=${v2.data?.value?.id}`);
  }

  // ====== TEST 2: Try POST /supplierInvoice with 1920 credit posting ======
  console.log("\n=== TEST 2: POST /supplierInvoice variations ===");

  // 2a: Use 1920 as the credit account
  console.log("\n--- 2a: supplierInvoice with 1920 credit ---");
  const si1 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "SINV-29F-001",
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-21",
    supplier: { id: suppId },
    voucher: {
      date: TODAY,
      description: "Supplier cost",
      postings: [
        {
          row: 1,
          date: TODAY,
          description: "Supplier cost",
          account: { id: acc6590?.id },
          amount: 56750,
          amountCurrency: 56750,
          amountGross: 56750,
          amountGrossCurrency: 56750,
          project: { id: projectId },
        },
        {
          row: 2,
          date: TODAY,
          description: "Bank",
          account: { id: acc1920?.id },
          amount: -56750,
          amountCurrency: -56750,
          amountGross: -56750,
          amountGrossCurrency: -56750,
        },
      ],
    },
  });
  console.log(`SI 2a: status=${si1.status} id=${si1.data?.value?.id}`);

  // 2b: Try without specifying credit account at all - some APIs auto-create it
  if (si1.status >= 400) {
    console.log("\n--- 2b: supplierInvoice no explicit credit posting, amountCurrency on top ---");
    const si2 = await api("POST", "/supplierInvoice", {
      invoiceNumber: "SINV-29F-002",
      invoiceDate: TODAY,
      invoiceDueDate: "2026-04-21",
      supplier: { id: suppId },
      amountCurrency: 56750,
      voucher: {
        date: TODAY,
        description: "Supplier cost",
        postings: [
          {
            row: 1,
            date: TODAY,
            description: "Supplier cost",
            account: { id: acc6590?.id },
            amount: 56750,
            amountCurrency: 56750,
            amountGross: 56750,
            amountGrossCurrency: 56750,
          },
          {
            row: 2,
            date: TODAY,
            description: "Leverandørgjeld",
            account: { id: acc2400?.id },
            amount: -56750,
            amountCurrency: -56750,
            amountGross: -56750,
            amountGrossCurrency: -56750,
          },
        ],
      },
    });
    console.log(`SI 2b: status=${si2.status} id=${si2.data?.value?.id}`);
  }

  // ====== TEST 3: Check POST /purchase/order as alternative supplier cost path ======
  console.log("\n=== TEST 3: Check purchase order endpoints ===");
  const po1 = await api("GET", "/purchase/order?count=1&fields=*");
  console.log(`GET purchase/order: status=${po1.status}`);

  // ====== TEST 4: Look for project/orderline with supplier/vendor via different approach ======
  console.log("\n=== TEST 4: Orderline variations ===");

  // Check if there's a "supplier" field (not "vendor") on orderline
  const ol1 = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Test29E Supplier cost",
    date: TODAY,
    count: 1,
    unitCostCurrency: 56750,
    isChargeable: false,
    supplier: { id: suppId },
  });
  console.log(`Orderline with supplier field: status=${ol1.status} id=${ol1.data?.value?.id}`);
  if (ol1.status < 400 && ol1.data?.value) {
    console.log(`  supplier: ${JSON.stringify(ol1.data.value.supplier)}`);
    console.log(`  vendor: ${JSON.stringify(ol1.data.value.vendor)}`);
  }

  // ====== TEST 5: Check if the scoring might check for voucher with project+supplier ======
  // Read back the voucher from test 1 to verify project persistence
  if (v1.status < 400 && v1.data?.value?.id) {
    console.log("\n=== TEST 5: Read back Leverandørfaktura voucher ===");
    const vRead = await api("GET", `/ledger/voucher/${v1.data.value.id}?fields=*`);
    if (vRead.data?.value?.postings) {
      console.log("Postings:");
      for (const p of vRead.data.value.postings) {
        console.log(`  row=${p.row} acct=${p.account?.number} amount=${p.amount} project=${p.project?.id || 'null'}`);
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
