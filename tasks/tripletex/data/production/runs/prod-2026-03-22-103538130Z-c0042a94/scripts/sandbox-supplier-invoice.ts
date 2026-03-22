const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json();
  console.log(`PUT ${path} → ${r.status}`);
  if (!r.ok) { console.log("  ERROR:", JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}

async function main() {
  const TS = Date.now();

  // Setup: create supplier, get accounts
  const [dept, pmAss, acct, vat, vtRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=id"),
    get("/employee?assignableProjectManagers=true&count=1&fields=id"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  const deptId = dept!.values[0].id;
  const pmId = pmAss!.values[0].id;
  const a1920 = acct!.values.find((a: any) => a.number === 1920);
  const acc6590 = acct!.values.find((a: any) => a.number === 6590);
  const acc2400 = acct!.values.find((a: any) => a.number === 2400);
  const vatId = vat!.values[0].id;
  const vtId = vtRes!.values[0].id;

  // Create customer + supplier + employees + project
  const [cust, supp, emps] = await Promise.all([
    post("/customer", { name: `TestCust ${TS}`, organizationNumber: "970096531", isCustomer: true }),
    post("/supplier", { name: `TestSupp ${TS}`, organizationNumber: "804473823", isSupplier: true }),
    post("/employee/list", [
      { firstName: "TestPM", lastName: `${TS}`, email: `pm.${TS}@example.org`, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: "TestCon", lastName: `${TS}`, email: `con.${TS}@example.org`, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
  ]);
  const custId = cust!.value.id;
  const suppId = supp!.value.id;
  const e1 = emps!.values[0].id;
  const e2 = emps!.values[1].id;

  const proj = await post("/project", {
    name: `TestProject ${TS}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 265000,
  });
  const pId = proj!.value.id;

  // Now try to create a supplierInvoice via importDocument
  console.log("\n=== SUPPLIER INVOICE VIA importDocument ===");

  // Build minimal EHF XML for text-only supplier invoice
  const invoiceNumber = `SI-${TS}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>${TODAY}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>TestSupp ${TS}</cbc:Name></cac:PartyName>
      <cac:PartyIdentification><cbc:ID schemeID="NO:ORGNR">804473823</cbc:ID></cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>Testgate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0150</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO804473823MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>TestCust ${TS}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">26800.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">26800.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">26800.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">26800.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">26800.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">26800.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Leverandørkostnad prosjekt</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">26800.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  // Import the document
  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, "invoice.xml");

  const impRes = await fetch(`${BASE}/supplierInvoice/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impBody = await impRes.json();
  console.log(`POST /supplierInvoice/importDocument → ${impRes.status}`);
  console.log("Response:", JSON.stringify(impBody, null, 2).slice(0, 1000));

  if (impRes.ok) {
    // Get the supplierInvoice ID
    const siId = impBody.value?.id || impBody.values?.[0]?.id;
    if (siId) {
      console.log("SupplierInvoice ID:", siId);

      // Read it back
      const siFull = await get(`/supplierInvoice/${siId}?fields=*`);
      console.log("SI Full:", JSON.stringify(siFull?.value, null, 2).slice(0, 1000));

      // Check if we can link it to the project
      // Try PUT to add project reference
      if (siFull?.value) {
        const siVal = siFull.value;
        // Check the voucher that was created
        if (siVal.voucher?.id) {
          const vch = await get(`/ledger/voucher/${siVal.voucher.id}?fields=*,postings(*)`);
          console.log("SI Voucher:", JSON.stringify(vch?.value, null, 2).slice(0, 1000));

          // Try to update postings to add project
          if (vch?.value?.postings) {
            for (const p of vch.value.postings) {
              if (p.account?.id === acc6590?.id || p.amount > 0) {
                console.log("Posting to update with project:", p.id, "row:", p.row);
              }
            }
          }
        }

        // Check if SI has project field
        console.log("SI project:", siVal.project);

        // Try to PUT the SI with project reference
        console.log("\n=== TRY PUT SI WITH PROJECT ===");
        const putSi = await put(`/supplierInvoice/${siId}`, {
          ...siVal,
          project: { id: pId },
        });
        if (putSi) {
          console.log("PUT SI with project succeeded:", putSi.value?.project);
        }
      }
    }
  }

  // Also check: what does the invoice look like in the project context?
  console.log("\n=== CHECK SUPPLIER INVOICES FOR SUPPLIER ===");
  const siList = await get(`/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*`);
  console.log("SI count for supplier:", siList?.values?.length || 0);
}

main().catch(e => console.error("FATAL:", e.message));
