const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const companyId = 108114337;

  // 1. Try PUT /company with vatNumber field
  console.log("=== PUT /company attempts ===");
  const getComp = await api("GET", `/company/${companyId}?fields=*`);
  const comp = getComp.data.value;

  // Try adding vatNumber
  const put1 = await api("PUT", `/company/${companyId}`, { ...comp, vatNumber: "NO514295328MVA" });
  console.log(`PUT vatNumber: ${put1.status} ${put1.ok ? 'OK' : JSON.stringify(put1.data).substring(0, 200)}`);

  // Try adding vatRegistered
  const put2 = await api("PUT", `/company/${companyId}`, { ...comp, vatRegistered: true });
  console.log(`PUT vatRegistered: ${put2.status} ${put2.ok ? 'OK' : JSON.stringify(put2.data).substring(0, 200)}`);

  // 2. Search for settings endpoints
  console.log("\n=== SETTINGS ENDPOINTS ===");
  const settingsEndpoints = [
    "/company/settings/1?fields=*",
    "/company/settings/altinn?fields=*",
    "/company/settings/payroll?fields=*",
    "/company/settings?fields=*",
    "/ledger/vat?fields=*",
    "/ledger/vatType/1?fields=*",
  ];
  for (const ep of settingsEndpoints) {
    const r = await api("GET", ep);
    console.log(`GET ${ep}: ${r.status} ${r.ok ? JSON.stringify(r.data).substring(0, 300) : (r.data?.message || '').substring(0, 100)}`);
  }

  // 3. Check vatType 1 details
  console.log("\n=== VAT TYPE 1 DETAILS ===");
  const vt = await api("GET", "/ledger/vatType/1?fields=*");
  if (vt.ok) {
    for (const [k, v] of Object.entries(vt.data.value || {})) {
      console.log(`  ${k} = ${JSON.stringify(v)}`);
    }
  }

  // 4. The KEY question: try POST /supplierInvoice with different vatTypes
  // Maybe the amounts only compute for certain vatTypes
  console.log("\n=== SI WITH vatType=3 (exempt) ===");
  const sRes = await api("POST", "/supplier", { name: "VATTest3", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // SI with vatType=3 (no VAT)
  const si3 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-NOVATTYPE",
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    amountCurrency: -12500,
    voucher: {
      date: "2026-03-22",
      description: "no vat test",
      postings: [
        { row: 1, date: "2026-03-22", description: "no vat", account: { id: expAcctId }, vatType: { id: 3 }, amount: 12500, amountCurrency: 12500, amountGross: 12500, amountGrossCurrency: 12500 },
        { row: 2, date: "2026-03-22", description: "no vat", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500 },
      ],
    },
  });
  if (si3.ok) {
    const v = si3.data.value;
    console.log(`  SI: amount=${v.amount} amountCurrency=${v.amountCurrency} amountExcludingVat=${v.amountExcludingVat} amountExcludingVatCurrency=${v.amountExcludingVatCurrency} outstandingAmount=${v.outstandingAmount}`);
  } else {
    console.log(`  FAIL: ${JSON.stringify(si3.data).substring(0, 300)}`);
  }

  // 5. Also check: does importDocument set amounts differently?
  // Get the most recent importDocument-created SI
  console.log("\n=== COMPARE: importDocument SI amounts ===");
  const allSI = await api("GET", "/supplierInvoice?from=0&count=5&sorting=id&order=desc&fields=id,invoiceNumber,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,orderLines(*)");
  for (const si of allSI.data.values || []) {
    const hasOL = (si.orderLines?.length || 0) > 0;
    console.log(`  SI ${si.id} inv="${si.invoiceNumber}" amt=${si.amount} amtC=${si.amountCurrency} amtExVat=${si.amountExcludingVat} amtExVatC=${si.amountExcludingVatCurrency} outst=${si.outstandingAmount} hasOrderLines=${hasOL}`);
  }

  // 6. Check if there's a companyVatType or vatReturn
  console.log("\n=== VAT RETURN / COMPANY VAT ===");
  const vatRet = await api("GET", "/vatReturns/comment?fields=*");
  if (vatRet.ok) {
    console.log(`  vatReturns/comment count: ${vatRet.data.fullResultSize}`);
    for (const vc of (vatRet.data.values || []).slice(0, 5)) {
      console.log(`  code=${vc.vatCode} comments: ${JSON.stringify(vc.comments?.map((c: any) => c.title)).substring(0, 200)}`);
    }
  }

  // 7. The real question: is VAT deduction what matters?
  // vatType=1 means "Fradrag inngående mva, full sats" - VAT DEDUCTION on purchases
  // If company is not VAT registered, deduction doesn't apply, so maybe amounts stay 0?
  // Let's try vatType=0 (no VAT at all)
  console.log("\n=== SI with NO vatType on expense line ===");
  const si0 = await api("POST", "/supplierInvoice", {
    invoiceNumber: "INV-NOVAT0",
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    amountCurrency: -12500,
    voucher: {
      date: "2026-03-22",
      description: "no vat type test",
      postings: [
        { row: 1, date: "2026-03-22", description: "no vat", account: { id: expAcctId }, amount: 12500, amountCurrency: 12500, amountGross: 12500, amountGrossCurrency: 12500 },
        { row: 2, date: "2026-03-22", description: "no vat", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500 },
      ],
    },
  });
  if (si0.ok) {
    const v = si0.data.value;
    console.log(`  SI: amount=${v.amount} amountCurrency=${v.amountCurrency} amountExcludingVat=${v.amountExcludingVat} outstandingAmount=${v.outstandingAmount}`);
  } else {
    console.log(`  FAIL: ${JSON.stringify(si0.data).substring(0, 300)}`);
  }
}

main().catch(console.error);
