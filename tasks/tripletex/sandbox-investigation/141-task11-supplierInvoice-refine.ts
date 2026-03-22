/**
 * Refine POST /supplierInvoice:
 * 1. Fix amounts (may need booking first)
 * 2. Set supplierInvoice description
 * 3. Book the voucher
 * 4. Verify full state
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 80)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const description = "kontortjenester";
  const gross = 12500;
  const net = 10000;

  // Create supplier
  const sRes = await api("POST", "/supplier", { name: "RefSI AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;

  // Get expense account + voucherType
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*");
  const vtId = vtRes.data.values[0].id;

  // Test A: POST /supplierInvoice with description at SI level too
  console.log("\n=== Test A: POST /supplierInvoice ===");
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-REF-001",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    description: description,  // SI-level description
    voucher: {
      date,
      description,
      voucherType: { id: vtId },
      postings: [
        {
          row: 1,
          date,
          description,
          account: { id: expAcctId },
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross,
        },
        {
          row: 2,
          date,
          description,
          account: { id: supplierLedger },
          supplier: { id: supplierId },
          amount: -gross,
          amountCurrency: -gross,
          amountGross: -gross,
          amountGrossCurrency: -gross,
          invoiceNumber: "INV-REF-001",
          termOfPayment: date,
        },
      ],
    },
  });

  if (!siRes.ok) {
    console.error("FAIL:", JSON.stringify(siRes.data, null, 2).substring(0, 1000));
    return;
  }

  const siId = siRes.data.value.id;
  const voucherId = siRes.data.value.voucher?.id;
  console.log(`  Created SI: id=${siId} voucher=${voucherId}`);
  console.log(`  amount=${siRes.data.value.amount} amountExVat=${siRes.data.value.amountExcludingVat}`);

  // Step 2: Book the voucher
  console.log("\n=== Book voucher ===");
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    id: voucherId,
    version: 0,
    date,
    description,
    voucherType: { id: vtId },
  });
  console.log("  Book result:", bookRes.status, bookRes.ok ? "OK" : JSON.stringify(bookRes.data).substring(0, 500));

  // Step 3: Full audit after booking
  console.log("\n=== AUDIT ===");
  
  // Read SI
  const siRead = await api("GET", `/supplierInvoice/${siId}?fields=id,invoiceNumber,invoiceDate,supplier(*),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(*),description,voucher(*),outstandingAmount,isCreditNote,invoiceDueDate`);
  if (siRead.ok) {
    const s = siRead.data.value;
    console.log(`\nsupplierInvoice readback:`);
    console.log(`  id=${s.id} invoiceNumber="${s.invoiceNumber}" invoiceDate="${s.invoiceDate}"`);
    console.log(`  supplier: id=${s.supplier?.id} name="${s.supplier?.name}"`);
    console.log(`  amount=${s.amount} amountExVat=${s.amountExcludingVat}`);
    console.log(`  amountCurrency=${s.amountCurrency} amountExVatCurrency=${s.amountExcludingVatCurrency}`);
    console.log(`  description="${s.description}"`);
    console.log(`  outstandingAmount=${s.outstandingAmount}`);
    console.log(`  voucher: id=${s.voucher?.id} number=${s.voucher?.number} desc="${s.voucher?.description}"`);
  }

  // Read voucher with expanded postings
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,date,voucherType(*),vendorInvoiceNumber,postings(id,row,date,description,account(id,number),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id,number,percentage),supplier(id,name),invoiceNumber,termOfPayment)`);
  if (vRead.ok) {
    const v = vRead.data.value;
    console.log(`\nvoucher readback:`);
    console.log(`  id=${v.id} number=${v.number} desc="${v.description}"`);
    console.log(`  voucherType: ${v.voucherType?.name}`);
    console.log(`  vendorInvoiceNumber: ${v.vendorInvoiceNumber}`);
    for (const p of (v.postings || [])) {
      console.log(`  posting: row=${p.row} acct=${p.account?.number} amt=${p.amount} amtGross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.percentage}%) supplier=${p.supplier?.name||'-'} inv=${p.invoiceNumber||'-'}`);
    }
  }
}

main().catch(console.error);
