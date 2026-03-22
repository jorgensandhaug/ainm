const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 100)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 12500;
  const net = 10000;
  const desc = "kontortjenester";

  const sRes = await api("POST", "/supplier", { name: "SendLedger AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=id");
  const vtId = vtRes.data.values[0].id;

  const payload = {
    invoiceDate: date,
    invoiceNumber: "INV-STL-001",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    currency: { id: 1 },
    amountCurrency: -gross,
    voucher: {
      date, description: desc,
      voucherType: { id: vtId },
      postings: [
        { row: 1, date, description: desc, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description: desc, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-STL-001", termOfPayment: "2026-04-21" },
      ],
    },
  };

  // Test A: POST /supplierInvoice?sendToLedger=true
  console.log("=== Test A: POST ?sendToLedger=true ===");
  const siA = await api("POST", "/supplierInvoice?sendToLedger=true", payload);
  if (siA.ok) {
    const a = siA.data.value;
    const vId = a.voucher.id;
    const vRB = await api("GET", `/ledger/voucher/${vId}?fields=id,number,description`);
    console.log(`  SI: amt=${a.amount} amtC=${a.amountCurrency} outstanding=${a.outstandingAmount}`);
    console.log(`  Voucher: num=${vRB.data.value?.number} desc="${vRB.data.value?.description}"`);
  }

  // Test B: POST without sendToLedger, then check if we can skip GET+PUT
  console.log("\n=== Test B: POST then just PUT bare ===");
  const siB = await api("POST", "/supplierInvoice", { ...payload, invoiceNumber: "INV-STL-002" });
  if (siB.ok) {
    const b = siB.data.value;
    const vIdB = b.voucher.id;
    // Try PUT with just id+version from the POST response
    const versionB = 3; // From golden test, version is always 3 after POST with amountCurrency
    console.log(`  Attempting PUT with version=${versionB}`);
    const putB = await api("PUT", `/ledger/voucher/${vIdB}`, {
      id: vIdB,
      version: versionB,
      date,
      voucherType: { id: vtId },
    });
    if (putB.ok) {
      console.log(`  Booked without GET! num=${putB.data.value?.number}`);
    } else {
      console.log(`  Fail: ${putB.data?.validationMessages?.[0]?.message || putB.data?.message || JSON.stringify(putB.data).substring(0, 200)}`);
      // Try with version 0
      const putB2 = await api("PUT", `/ledger/voucher/${vIdB}`, { id: vIdB, version: 0, date, voucherType: { id: vtId } });
      console.log(`  v0: ${putB2.status} ${putB2.ok ? 'num=' + putB2.data.value?.number : putB2.data?.message || ''}`);
    }
  }

  // Test C: What does the voucher look like from POST with amountCurrency but without sendToLedger?
  console.log("\n=== Test C: Check voucher version pattern ===");
  const siC = await api("POST", "/supplierInvoice", { ...payload, invoiceNumber: "INV-STL-003" });
  if (siC.ok) {
    const c = siC.data.value;
    const vIdC = c.voucher.id;
    // Read voucher to check exact version
    const vReadC = await api("GET", `/ledger/voucher/${vIdC}?fields=id,version,number`);
    console.log(`  Voucher: version=${vReadC.data.value?.version} number=${vReadC.data.value?.number}`);
    // Now try PUT with that exact version but no postings
    const putC = await api("PUT", `/ledger/voucher/${vIdC}`, {
      id: vIdC,
      version: vReadC.data.value?.version,
      date,
      voucherType: { id: vtId },
    });
    console.log(`  PUT: ${putC.status} ${putC.ok ? 'num=' + putC.data.value?.number : JSON.stringify(putC.data?.validationMessages?.[0]?.message || '').substring(0, 200)}`);
  }

  // Test D: Can we read the version from the POST response itself?
  console.log("\n=== Test D: POST response voucher details ===");
  const siD = await api("POST", "/supplierInvoice", { ...payload, invoiceNumber: "INV-STL-004" });
  if (siD.ok) {
    console.log("  Full POST response voucher:", JSON.stringify(siD.data.value.voucher));
    console.log("  Full POST response keys:", Object.keys(siD.data.value));
  }
}

main().catch(console.error);
