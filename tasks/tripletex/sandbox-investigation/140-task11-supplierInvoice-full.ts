/**
 * POST /supplierInvoice with full voucher+postings.
 * This could be THE solution: creates supplierInvoice entity AND lets us control description.
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
  const vat = 2500;

  // Create supplier
  const sRes = await api("POST", "/supplier", { name: "FullSI AS", organizationNumber: "823456786" });
  if (!sRes.ok) { console.error("Supplier fail:", JSON.stringify(sRes.data).substring(0, 300)); return; }
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  console.log(`  Supplier: id=${supplierId} ledgerAcct=${supplierLedger}`);

  // Get expense account + vatType + voucherType
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*");
  const vtId = vtRes.data.values[0].id;
  console.log(`  expAcct=${expAcctId} voucherType=${vtId}`);

  // POST /supplierInvoice with full voucher
  console.log("\n=== POST /supplierInvoice (full) ===");
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-FULL-001",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
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
          invoiceNumber: "INV-FULL-001",
          termOfPayment: date,
        },
      ],
    },
  });

  if (!siRes.ok) {
    console.error("FAIL:", JSON.stringify(siRes.data, null, 2).substring(0, 1000));
    
    // Try without amountExcludingVat and currency
    console.log("\n=== Retry without amountExcludingVat/currency ===");
    const siRes2 = await api("POST", "/supplierInvoice", {
      invoiceDate: date,
      invoiceNumber: "INV-FULL-002",
      supplier: { id: supplierId },
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
            invoiceNumber: "INV-FULL-002",
            termOfPayment: date,
          },
        ],
      },
    });
    if (!siRes2.ok) {
      console.error("FAIL 2:", JSON.stringify(siRes2.data, null, 2).substring(0, 1000));
    } else {
      console.log("SUCCESS:", JSON.stringify(siRes2.data, null, 2).substring(0, 1000));
      await audit(siRes2.data);
    }
    return;
  }

  console.log("SUCCESS:", JSON.stringify(siRes.data, null, 2).substring(0, 1000));
  await audit(siRes.data);
}

async function audit(responseData: any) {
  console.log("\n=== AUDIT ===");
  const siId = responseData.value?.id;
  if (!siId) { console.log("No supplierInvoice id in response"); return; }

  // Read supplierInvoice
  const si = await api("GET", `/supplierInvoice/${siId}?fields=*`);
  if (si.ok) {
    const s = si.data.value;
    console.log(`supplierInvoice: id=${s.id} invoiceNumber="${s.invoiceNumber}"`);
    console.log(`  supplier: ${JSON.stringify(s.supplier)}`);
    console.log(`  amount=${s.amount} amountExcludingVat=${s.amountExcludingVat}`);
    console.log(`  description="${s.description}"`);
    console.log(`  voucher: ${JSON.stringify(s.voucher)}`);
    console.log(`  outstandingAmount=${s.outstandingAmount}`);

    // Read the linked voucher
    const voucherId = s.voucher?.id;
    if (voucherId) {
      const v = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
      if (v.ok) {
        const vd = v.data.value;
        console.log(`\nvoucher: id=${vd.id} number=${vd.number} desc="${vd.description}"`);
        console.log(`  voucherType: ${JSON.stringify(vd.voucherType)}`);
        console.log(`  vendorInvoiceNumber: ${vd.vendorInvoiceNumber}`);
        for (const p of (vd.postings || [])) {
          console.log(`  posting row=${p.row} acct=${p.account?.number} amt=${p.amount} amtGross=${p.amountGross} vatType=${p.vatType?.id}`);
        }
      }
    }
  }
}

main().catch(console.error);
