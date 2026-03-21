// Test alternative approaches for creating supplier invoices
// without relying on importDocument (file upload)
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
  if (res.status >= 400) console.log("  ERR:", typeof json === 'string' ? json.slice(0,500) : JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  const ts = Date.now();

  // Test 1: POST /supplierInvoice — is it available?
  console.log("=== Test 1: GET /supplierInvoice (check availability) ===");
  const si1 = await api("GET", "/supplierInvoice?count=1&fields=id");

  // Test 2: POST /supplierInvoice — try to create one
  console.log("\n=== Test 2: POST /supplierInvoice (create) ===");
  // First create a supplier
  const suppRes = await api("POST", "/supplier", {
    name: `Test Supplier ${ts}`,
    organizationNumber: "910079457"
  });
  const suppId = suppRes.data?.value?.id;
  const suppLedgerId = suppRes.data?.value?.ledgerAccount?.id;
  console.log(`Supplier: id=${suppId}, ledgerAccount=${suppLedgerId}`);

  // Get expense account
  const acctRes = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=id,number");
  const acctId = acctRes.data?.values?.[0]?.id;
  console.log(`Account 6540: id=${acctId}`);

  // Try POST /supplierInvoice directly
  const siCreate = await api("POST", "/supplierInvoice", {
    invoiceNumber: `INV-TEST-${ts}`,
    invoiceDate: "2026-03-21",
    invoiceDueDate: "2026-04-20",
    supplier: { id: suppId },
    amount: 42100,
    amountCurrency: 42100
  });

  // Test 3: Check /incomingInvoice (expected 403)
  console.log("\n=== Test 3: GET /incomingInvoice/search (beta check) ===");
  const ii = await api("GET", "/incomingInvoice/search?count=1");

  // Test 4: Create voucher directly with voucherType that makes it a supplier invoice
  console.log("\n=== Test 4: GET /ledger/voucherType (find supplier invoice type) ===");
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=*");
  if (vtRes.status === 200) {
    for (const vt of (vtRes.data?.values || [])) {
      console.log(`  voucherType: id=${vt.id} name="${vt.name}"`);
    }
  }

  // Test 5: Create a voucher with supplier-invoice-like properties
  console.log("\n=== Test 5: POST /ledger/voucher with supplier fields ===");
  const voucherRes = await api("POST", "/ledger/voucher?sendToLedger=false", {
    date: "2026-03-21",
    description: `kontortjenester`,
    postings: [
      {
        row: 1,
        account: { id: acctId },
        description: "kontortjenester",
        vatType: { id: 1 },
        amount: 33680,
        amountCurrency: 33680,
        amountGross: 42100,
        amountGrossCurrency: 42100
      },
      {
        row: 2,
        account: { id: suppLedgerId },
        supplier: { id: suppId },
        description: "kontortjenester",
        amount: -42100,
        amountCurrency: -42100,
        amountGross: -42100,
        amountGrossCurrency: -42100,
        invoiceNumber: `INV-TEST-${ts}`,
        termOfPayment: "2026-04-20"
      }
    ]
  });

  if (voucherRes.status === 201) {
    const v = voucherRes.data?.value;
    console.log(`  Voucher: id=${v?.id}, number=${v?.number}`);

    // Check if a supplierInvoice was auto-created
    console.log("\n=== Test 5b: Check if supplierInvoice was created ===");
    const siCheck = await api("GET", `/supplierInvoice?voucherId=${v?.id}&fields=*`);
    if (siCheck.data?.values?.length) {
      console.log("  YES! SupplierInvoice auto-created:");
      console.log(JSON.stringify(siCheck.data.values[0], null, 2).slice(0, 500));
    } else {
      console.log("  No supplierInvoice found for this voucher");
    }

    // Now book it
    const bookRes = await api("PUT", `/ledger/voucher/${v?.id}?sendToLedger=true`, {
      version: v?.version
    });
    console.log(`  Booked: number=${bookRes.data?.value?.number}`);

    // Check again after booking
    console.log("\n=== Test 5c: Check supplierInvoice after booking ===");
    const siCheck2 = await api("GET", `/supplierInvoice?voucherId=${v?.id}&fields=*`);
    if (siCheck2.data?.values?.length) {
      console.log("  YES! SupplierInvoice found after booking:");
      const si = siCheck2.data.values[0];
      console.log(`  id=${si.id} invoiceNumber=${si.invoiceNumber} amount=${si.amount} outstandingAmount=${si.outstandingAmount}`);
    } else {
      console.log("  Still no supplierInvoice after booking");
    }
  }

  // Test 6: Check if Leverandørfaktura voucherType makes a difference
  console.log("\n=== Test 6: POST /ledger/voucher with Leverandørfaktura voucherType ===");
  const suppRes2 = await api("POST", "/supplier", {
    name: `Test Supplier2 ${ts}`,
    organizationNumber: "910079457"
  });
  const suppId2 = suppRes2.data?.value?.id;
  const suppLedgerId2 = suppRes2.data?.value?.ledgerAccount?.id;

  // Find the Leverandørfaktura voucherType
  const vtSearch = await api("GET", "/ledger/voucherType?name=Leverandørfaktura&fields=*");
  let leverandorVtId: number | undefined;
  for (const vt of (vtSearch.data?.values || [])) {
    if (vt.name === "Leverandørfaktura") {
      leverandorVtId = vt.id;
      console.log(`  Found Leverandørfaktura voucherType: id=${vt.id}`);
    }
  }

  if (leverandorVtId) {
    const v2Res = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2026-03-21",
      description: "kontortjenester vt test",
      voucherType: { id: leverandorVtId },
      postings: [
        {
          row: 1,
          account: { id: acctId },
          description: "kontortjenester",
          vatType: { id: 1 },
          amount: 33680,
          amountCurrency: 33680,
          amountGross: 42100,
          amountGrossCurrency: 42100
        },
        {
          row: 2,
          account: { id: suppLedgerId2 },
          supplier: { id: suppId2 },
          description: "kontortjenester",
          amount: -42100,
          amountCurrency: -42100,
          amountGross: -42100,
          amountGrossCurrency: -42100,
          invoiceNumber: `INV-VT-${ts}`,
          termOfPayment: "2026-04-20"
        }
      ]
    });

    if (v2Res.status === 201) {
      const v2 = v2Res.data?.value;
      console.log(`  Voucher: id=${v2?.id}, number=${v2?.number}, voucherType=${v2?.voucherType?.id}`);

      // Check for supplierInvoice
      const siCheck3 = await api("GET", `/supplierInvoice?voucherId=${v2?.id}&fields=*`);
      if (siCheck3.data?.values?.length) {
        console.log("  YES! SupplierInvoice auto-created with voucherType!");
        const si = siCheck3.data.values[0];
        console.log(`  id=${si.id} invoiceNumber=${si.invoiceNumber} amount=${si.amount} outstandingAmount=${si.outstandingAmount}`);
      } else {
        console.log("  No supplierInvoice even with voucherType");
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
