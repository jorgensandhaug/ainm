/**
 * Full pipeline test: POST /incomingInvoice with correct payload.
 * Fix: add externalId to orderLines.
 * Test all sendTo modes: inbox, nonPosted, ledger.
 * Then verify the resulting supplierInvoice + voucher state.
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
  const dueDate = "2026-04-21";
  const supplierName = "IncomingPipe AS";
  const orgNumber = "823456786";
  const invoiceNumber = "INV-INC-PIPE-001";
  const description = "kontortjenester";
  const gross = 12500;
  const net = 10000;

  // Step 1: Create supplier
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  if (!sRes.ok) { console.error("Supplier fail:", JSON.stringify(sRes.data).substring(0, 300)); return; }
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  console.log(`  Supplier: id=${supplierId} ledgerAcct=${supplierLedger}`);

  // Step 2: Get expense account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  if (!acctRes.ok) { console.error("Account fail"); return; }
  const expAcctId = acctRes.data.values[0].id;
  console.log(`  Expense account 7140: id=${expAcctId}`);

  // Step 3: POST /incomingInvoice with sendTo=ledger
  console.log("\n=== POST /incomingInvoice?sendTo=ledger ===");
  const payload = {
    invoiceHeader: {
      vendorId: supplierId,
      invoiceDate: date,
      dueDate: dueDate,
      currencyId: 1, // NOK
      invoiceAmount: gross,
      description: description,
      invoiceNumber: invoiceNumber,
    },
    orderLines: [
      {
        externalId: "line-1",
        row: 1,
        description: description,
        accountId: expAcctId,
        count: 1,
        amountInclVat: gross,
        vatTypeId: 1, // 25% incoming
      },
    ],
  };

  const incRes = await api("POST", "/incomingInvoice?sendTo=ledger", payload);
  if (!incRes.ok) {
    console.error("incomingInvoice FAIL:", JSON.stringify(incRes.data, null, 2).substring(0, 800));

    // Try sendTo=nonPosted
    console.log("\n=== Retry with sendTo=nonPosted ===");
    const incRes2 = await api("POST", "/incomingInvoice?sendTo=nonPosted", payload);
    if (!incRes2.ok) {
      console.error("nonPosted FAIL:", JSON.stringify(incRes2.data, null, 2).substring(0, 800));

      // Try default (inbox)
      console.log("\n=== Retry with default (inbox) ===");
      const incRes3 = await api("POST", "/incomingInvoice", payload);
      if (!incRes3.ok) {
        console.error("inbox FAIL:", JSON.stringify(incRes3.data, null, 2).substring(0, 800));
        return;
      }
      console.log("SUCCESS (inbox):", JSON.stringify(incRes3.data, null, 2).substring(0, 1000));
      await auditState(incRes3.data);
      return;
    }
    console.log("SUCCESS (nonPosted):", JSON.stringify(incRes2.data, null, 2).substring(0, 1000));
    await auditState(incRes2.data);
    return;
  }
  console.log("SUCCESS (ledger):", JSON.stringify(incRes.data, null, 2).substring(0, 1000));
  await auditState(incRes.data);
}

async function auditState(responseData: any) {
  console.log("\n=== AUDIT ===");

  // The response should contain a voucherId or similar
  console.log("Response keys:", Object.keys(responseData));
  console.log("Full response:", JSON.stringify(responseData, null, 2).substring(0, 2000));

  // Try to find the voucherId from the response
  const voucherId = responseData?.value?.id || responseData?.values?.[0]?.id;
  if (voucherId) {
    // Read voucher
    const v = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,date,voucherType(*),postings(*),vendorInvoiceNumber,supplierVoucherType`);
    if (v.ok) {
      const vd = v.data.value;
      console.log(`\nVoucher: id=${vd.id} number=${vd.number} desc="${vd.description}"`);
      console.log(`  voucherType: ${JSON.stringify(vd.voucherType)}`);
      console.log(`  vendorInvoiceNumber: ${vd.vendorInvoiceNumber}`);
      console.log(`  supplierVoucherType: ${vd.supplierVoucherType}`);
      for (const p of (vd.postings || [])) {
        console.log(`  posting row=${p.row} acct=${p.account?.id}(${p.account?.number}) amt=${p.amount} amtGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id||'-'} desc="${p.description}"`);
      }
    }

    // Check supplierInvoice
    const si = await api("GET", `/supplierInvoice?voucherId=${voucherId}&fields=*`);
    if (si.ok && si.data.values?.length) {
      const sid = si.data.values[0];
      console.log(`\nSupplierInvoice: id=${sid.id} invoiceNumber="${sid.invoiceNumber}" amount=${sid.amount}`);
      console.log(`  supplier: ${JSON.stringify(sid.supplier)}`);
      console.log(`  amountExcludingVat=${sid.amountExcludingVat} outstandingAmount=${sid.outstandingAmount}`);
    } else {
      // Try by date
      const siDate = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-22&invoiceDateTo=2026-03-23&fields=*`);
      const match = siDate.data.values?.find((s: any) => s.voucher?.id === voucherId);
      if (match) {
        console.log(`\nSupplierInvoice (by date): id=${match.id} invoiceNumber="${match.invoiceNumber}" amount=${match.amount}`);
        console.log(`  supplier: ${JSON.stringify(match.supplier)}`);
      } else {
        console.log("\nNo supplierInvoice found for this voucher");
      }
    }
  } else {
    console.log("Could not extract voucherId from response");
  }
}

main().catch(console.error);
