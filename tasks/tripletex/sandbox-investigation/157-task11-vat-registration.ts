/**
 * Test VAT registration effect on POST /supplierInvoice amounts.
 * 1. Check current company VAT status
 * 2. Try to enable VAT registration
 * 3. Re-run POST /supplierInvoice and compare amounts
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
  return { status: res.status, ok: res.ok, data };
}

async function createSI(label: string) {
  // Create supplier
  const sRes = await api("POST", "/supplier", { name: `VATTest-${label}`, organizationNumber: "823456786" });
  if (!sRes.ok) { console.log(`  supplier fail: ${JSON.stringify(sRes.data).substring(0, 200)}`); return null; }
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;

  // Get expense account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // POST /supplierInvoice with amountCurrency
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: `INV-VAT-${label}`,
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    amountCurrency: -12500,
    voucher: {
      date: "2026-03-22",
      description: `kontortjenester ${label}`,
      postings: [
        { row: 1, date: "2026-03-22", description: `kontortjenester ${label}`, account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
        { row: 2, date: "2026-03-22", description: `kontortjenester ${label}`, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500 },
      ],
    },
  });
  if (!siRes.ok) { console.log(`  SI fail: ${JSON.stringify(siRes.data).substring(0, 300)}`); return null; }
  return siRes.data.value;
}

async function main() {
  // 1. Get company info with ALL fields
  console.log("=== COMPANY INFO ===");
  const compRes = await api("GET", "/company/1?fields=*");
  if (compRes.ok) {
    const c = compRes.data.value;
    console.log(`  id=${c.id} name="${c.name}" orgNumber=${c.organizationNumber}`);
    console.log(`  type=${c.type}`);
    // Print ALL fields to find VAT-related ones
    for (const [k, v] of Object.entries(c)) {
      if (typeof v !== 'object' || v === null) {
        console.log(`  ${k} = ${JSON.stringify(v)}`);
      }
    }
  }

  // 2. Check company settings
  console.log("\n=== COMPANY SETTINGS ===");
  const settRes = await api("GET", "/company/settings/altinn?fields=*");
  console.log(`  altinn: ${settRes.status} ${JSON.stringify(settRes.data).substring(0, 300)}`);

  // 3. Try /company/salesmodules for VAT-related
  const vatModules = ["AGRO", "MAMUT", "VAT", "MVA", "VAT_RETURN", "MVAMELDING", "VAT_REGISTRATION"];
  for (const name of vatModules) {
    const r = await api("POST", "/company/salesmodules", { name });
    const msg = r.data?.validationMessages?.[0]?.message || r.data?.message || '';
    console.log(`  module ${name}: ${r.status} ${r.ok ? 'ENABLED' : msg.substring(0, 80)}`);
  }

  // 4. Check if there's a vatSettings or similar endpoint
  const endpoints = [
    "/company/settings/vat",
    "/vatSettings",
    "/company/vatSettings",
    "/company/settings/tax",
    "/settings/vat",
    "/ledger/vatType?vatTypeId=1&fields=*",
  ];
  for (const ep of endpoints) {
    const r = await api("GET", ep);
    console.log(`  GET ${ep}: ${r.status} ${r.ok ? JSON.stringify(r.data).substring(0, 200) : (r.data?.message || '').substring(0, 80)}`);
  }

  // 5. Create SI BEFORE any VAT change
  console.log("\n=== SI BEFORE VAT CHANGE ===");
  const siBefore = await createSI("before");
  if (siBefore) {
    console.log(`  SI: amount=${siBefore.amount} amountCurrency=${siBefore.amountCurrency} amountExcludingVat=${siBefore.amountExcludingVat} amountExcludingVatCurrency=${siBefore.amountExcludingVatCurrency} outstandingAmount=${siBefore.outstandingAmount}`);
  }

  // 6. Try to PUT company with vatRegistered-like fields
  console.log("\n=== TRY ENABLING VAT ===");
  const companyId = compRes.data?.value?.id;
  if (companyId) {
    // Try various field names
    const vatAttempts = [
      { vatRegistered: true },
      { isVatRegistered: true },
      { mvaRegistered: true },
      { isMvaRegistered: true },
      { vatNumber: "NO514295328MVA" },
    ];
    for (const body of vatAttempts) {
      const r = await api("PUT", `/company/${companyId}`, { ...compRes.data.value, ...body });
      const fieldName = Object.keys(body)[0];
      console.log(`  PUT ${fieldName}: ${r.status} ${r.ok ? 'OK' : (r.data?.validationMessages?.[0]?.message || r.data?.message || '').substring(0, 100)}`);
    }
  }

  // 7. Try specific VAT settings endpoints
  console.log("\n=== VAT SETTINGS ENDPOINTS ===");
  const vatEndpoints = [
    ["/vatReturns/comment?fields=*", "GET"],
    ["/vatReturns?from=2026-01-01&to=2026-12-31&fields=*", "GET"],
    ["/company/settings/vat2?fields=*", "GET"],
  ];
  for (const [ep, method] of vatEndpoints) {
    const r = await api(method as string, ep);
    console.log(`  ${method} ${ep}: ${r.status} ${r.ok ? JSON.stringify(r.data).substring(0, 200) : (r.data?.message || '').substring(0, 80)}`);
  }

  // 8. Check altinn settings for VAT
  console.log("\n=== ALTINN SETTINGS ===");
  const altinn = await api("GET", "/company/settings/altinn?fields=*");
  if (altinn.ok) {
    for (const [k, v] of Object.entries(altinn.data.value || {})) {
      console.log(`  ${k} = ${JSON.stringify(v)}`);
    }
  }
}

main().catch(console.error);
