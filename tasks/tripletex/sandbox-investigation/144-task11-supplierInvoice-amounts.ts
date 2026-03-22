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

  const sRes = await api("POST", "/supplier", { name: "AmountSI AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*");
  const vtId = vtRes.data.values[0].id;

  // Create base SI
  console.log("\n=== Create SI ===");
  const si = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-AMT-001",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    voucher: {
      date, description,
      voucherType: { id: vtId },
      postings: [
        { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-AMT-001", termOfPayment: date },
      ],
    },
  });
  if (!si.ok) { console.error("Fail:", JSON.stringify(si.data)); return; }
  const siId = si.data.value.id;
  const voucherId = si.data.value.voucher.id;

  // Test A: PUT voucher WITHOUT description field (avoid the restriction)
  console.log("\n=== Test A: PUT voucher without description ===");
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version,date,voucherType(id),postings(id,version,row,date,account(id),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id),supplier(id),invoiceNumber,termOfPayment)`);
  if (vRead.ok) {
    const vd = vRead.data.value;
    const postings = vd.postings.map((p: any, i: number) => {
      if (i === 0) return { ...p, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross };
      return { ...p, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross };
    });
    // Try without description
    const put1 = await api("PUT", `/ledger/voucher/${voucherId}`, {
      id: vd.id,
      version: vd.version,
      date: vd.date,
      voucherType: vd.voucherType,
      postings,
    });
    console.log("  PUT (no desc):", put1.status, JSON.stringify(put1.data).substring(0, 500));
  }

  // Test B: Direct PUT on postings endpoint
  console.log("\n=== Test B: PUT /ledger/voucher/{id}/postings ===");
  const putPost = await api("PUT", `/ledger/voucher/${voucherId}/postings`, [
    { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
    { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
  ]);
  console.log("  Result:", JSON.stringify(putPost.data).substring(0, 500));

  // Test C: PUT on individual posting
  console.log("\n=== Test C: PUT individual posting ===");
  const vRead2 = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version,postings(id,version)`);
  if (vRead2.ok) {
    const postings = vRead2.data.value.postings;
    if (postings?.length) {
      const p0 = postings[0];
      const putP = await api("PUT", `/ledger/voucher/posting/${p0.id}`, {
        id: p0.id,
        version: p0.version,
        row: 1, date, description,
        account: { id: expAcctId },
        vatType: { id: 1 },
        amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
      });
      console.log("  Individual posting PUT:", putP.status, JSON.stringify(putP.data).substring(0, 500));
    }
  }

  // Test D: Try creating SI with orderLines instead of voucher postings  
  console.log("\n=== Test D: SI with orderLines ===");
  const si2 = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-AMT-002",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    orderLines: [
      { description, count: 1, unitCostPrice: net, amountExcludingVatCurrency: net, vatType: { id: 1 }, account: { id: expAcctId } },
    ],
    voucher: {
      date, description,
      voucherType: { id: vtId },
      postings: [
        { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
      ],
    },
  });
  console.log("  SI with orderLines:", si2.status, JSON.stringify(si2.data).substring(0, 600));

  if (si2.ok) {
    const si2Id = si2.data.value.id;
    const si2Read = await api("GET", `/supplierInvoice/${si2Id}?fields=id,invoiceNumber,amount,amountExcludingVat,voucher(id,number),orderLines(*)`);
    console.log("  SI2 readback:", JSON.stringify(si2Read.data).substring(0, 600));
  }

  // Final voucher state
  console.log("\n=== Final voucher state ===");
  const vFinal = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,voucherType(name),postings(row,account(number),amount,amountGross,vatType(number))`);
  if (vFinal.ok) {
    const vd = vFinal.data.value;
    console.log(`  Voucher: num=${vd.number}`);
    for (const p of vd.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}`);
    }
  }
}

main().catch(console.error);
