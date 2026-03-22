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
  const description = "kontortjenester";
  const gross = 12500;
  const net = 10000;

  const sRes = await api("POST", "/supplier", { name: "ApproveSI AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*");
  const vtId = vtRes.data.values[0].id;

  // Try POST with sendToLedger=true on the supplierInvoice itself
  console.log("\n=== Test 1: POST /supplierInvoice?sendToLedger=true ===");
  const si1 = await api("POST", "/supplierInvoice?sendToLedger=true", {
    invoiceDate: date,
    invoiceNumber: "INV-APP-001",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    voucher: {
      date, description,
      voucherType: { id: vtId },
      postings: [
        { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-APP-001", termOfPayment: date },
      ],
    },
  });
  console.log("  Result:", JSON.stringify(si1.data).substring(0, 500));

  // Now create a fresh one without sendToLedger
  console.log("\n=== Test 2: Create then approve ===");
  const si2 = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-APP-002",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    voucher: {
      date, description,
      voucherType: { id: vtId },
      postings: [
        { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-APP-002", termOfPayment: date },
      ],
    },
  });
  if (!si2.ok) { console.error("Create fail"); return; }
  const siId = si2.data.value.id;
  const voucherId = si2.data.value.voucher.id;

  // Try approve
  const app1 = await api("PUT", `/supplierInvoice/${siId}/:approve`, {});
  console.log("  Approve:", app1.status, JSON.stringify(app1.data).substring(0, 300));

  // Try reject/approve actions
  const app2 = await api("POST", `/supplierInvoice/${siId}/approve`, {});
  console.log("  POST approve:", app2.status, JSON.stringify(app2.data).substring(0, 300));

  // Check voucher actions
  const va1 = await api("POST", `/ledger/voucher/${voucherId}/:sendToLedger`, {});
  console.log("  POST :sendToLedger:", va1.status, JSON.stringify(va1.data).substring(0, 300));

  // Try the specific posting amounts by reading and updating postings directly
  console.log("\n=== Test 3: PUT postings directly ===");
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version,date,description,voucherType(id),postings(id,version,row,date,description,account(id),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id),supplier(id),invoiceNumber,termOfPayment)`);
  if (vRead.ok) {
    const vd = vRead.data.value;
    const postings = vd.postings || [];
    console.log(`  Existing postings: ${postings.length}`);
    for (const p of postings) {
      console.log(`    row=${p.row} acct=${p.account?.id} amt=${p.amount} amtGross=${p.amountGross}`);
    }

    // Update postings with amounts
    const updatedPostings = postings.map((p: any, i: number) => {
      if (i === 0) {
        return { ...p, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross };
      } else {
        return { ...p, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross };
      }
    });
    
    const putPost = await api("PUT", `/ledger/voucher/${voucherId}`, {
      id: vd.id,
      version: vd.version,
      date: vd.date,
      description: vd.description,
      voucherType: vd.voucherType,
      postings: updatedPostings,
    });
    console.log("  PUT voucher with amounts:", putPost.status, JSON.stringify(putPost.data).substring(0, 500));
  }

  // Final: read SI with simpler fields to avoid 400
  const siRead = await api("GET", `/supplierInvoice/${siId}?fields=id,invoiceNumber,invoiceDate,amount,amountExcludingVat,outstandingAmount,description,voucher(id,number)`);
  console.log("  SI final:", JSON.stringify(siRead.data).substring(0, 500));
}

main().catch(console.error);
