// Investigate supplierInvoice endpoint with correct fields

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 1500));
  }
  return { status: r.status, data: json };
}

async function main() {
  const suppId = 108439685;
  const projectId = 402041289;

  // 1. Try supplierInvoice without dueDate
  console.log("=== Test 1: POST /supplierInvoice without dueDate ===");
  const siRes1 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "TEST-001",
    invoiceDate: "2026-03-21",
    supplier: { id: suppId },
  });

  // 2. Try supplierInvoice with paymentDueDate instead of dueDate
  console.log("\n=== Test 2: POST /supplierInvoice with paymentDueDate ===");
  const siRes2 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "TEST-002",
    invoiceDate: "2026-03-21",
    paymentDueDate: "2026-04-20",
    supplier: { id: suppId },
  });
  if (siRes2.status < 400) {
    console.log("SUCCESS:", JSON.stringify(siRes2.data.value, null, 2)?.slice(0, 1000));
  }

  // 3. If we have a supplierInvoice, try to add voucher/postings to it
  if (siRes2.status < 400) {
    const siId = siRes2.data.value.id;
    console.log("\n=== SupplierInvoice ID:", siId, "===");

    // Check its full details
    const siRead = await api("GET", `/supplierInvoice/${siId}?fields=*`);
    console.log("supplierInvoice full:", JSON.stringify(siRead.data.value, null, 2)?.slice(0, 2000));

    // Try to add a voucher to the supplierInvoice
    console.log("\n=== Try adding voucher to supplierInvoice ===");

    // Get accounts
    const accRes = await api("GET", "/ledger/account?number=6590,2400&fields=id,number");
    const acc6590 = accRes.data.values.find((a: any) => a.number === 6590);
    const acc2400 = accRes.data.values.find((a: any) => a.number === 2400);

    // Try PUT to add voucher info
    const siUpdate = await api("PUT", `/supplierInvoice/${siId}`, {
      ...siRead.data.value,
      amountExcludingVat: 56300,
      amountExcludingVatCurrency: 56300,
    });
    if (siUpdate.status < 400) {
      console.log("Updated supplierInvoice:", JSON.stringify(siUpdate.data.value, null, 2)?.slice(0, 1000));
    }

    // Now try to create a supplierInvoice voucher via the special endpoint
    console.log("\n=== Try POST /supplierInvoice/:addRecipient ===");
    const addRecRes = await api("POST", `/supplierInvoice/${siId}/:addRecipient?employeeId=18441996&comment=test`);

    // Check for approve endpoint
    console.log("\n=== Try /supplierInvoice/:approve ===");
    const appRes = await api("PUT", `/supplierInvoice/${siId}/:approve`);
  }

  // 4. Try creating a brand new supplierInvoice with all possible fields
  console.log("\n=== Test 3: POST /supplierInvoice with amount fields ===");
  const siRes3 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "TEST-003",
    invoiceDate: "2026-03-21",
    paymentDueDate: "2026-04-20",
    supplier: { id: suppId },
    amountExcludingVat: 56300,
    amountExcludingVatCurrency: 56300,
  });
  if (siRes3.status < 400) {
    console.log("supplierInvoice:", JSON.stringify(siRes3.data.value, null, 2)?.slice(0, 1000));
  }

  // 5. Now let's check: does the supplierInvoice show up linked to the supplier?
  console.log("\n=== Search supplierInvoices ===");
  const siSearchRes = await api("GET", `/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*&count=10`);
  if (siSearchRes.status < 400) {
    console.log("Found:", siSearchRes.data.values?.length, "supplier invoices");
    for (const si of siSearchRes.data.values || []) {
      console.log(`  id=${si.id} number=${si.invoiceNumber} supplier=${si.supplier?.id} amount=${si.amountExcludingVat} voucher=${si.voucher?.id}`);
    }
  }

  // 6. Check if we can create supplierInvoice with project linkage
  console.log("\n=== Test 4: POST /supplierInvoice with project ===");
  const siRes4 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "TEST-004",
    invoiceDate: "2026-03-21",
    paymentDueDate: "2026-04-20",
    supplier: { id: suppId },
    amountExcludingVat: 56300,
    amountExcludingVatCurrency: 56300,
    project: { id: projectId },
  });
  if (siRes4.status < 400) {
    console.log("supplierInvoice with project:", JSON.stringify(siRes4.data.value, null, 2)?.slice(0, 1000));
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
