const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { console.log(`GET ${path} → ${r.status}:`, JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.log(`POST ${path} → ${r.status}:`, JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.log(`PUT ${path} → ${r.status}:`, JSON.stringify(b).slice(0, 400)); return null; }
  return b;
}

async function main() {
  const TS = Date.now();
  const SUPP_NAME = "Montana Test " + TS;
  const SUPP_ORG = "804473823";
  const SUPP_COST = 26800;

  // Get company org
  const whoAmI = await get("/token/session/>whoAmI?fields=company(organizationNumber)");
  const companyOrg = whoAmI?.value?.company?.organizationNumber || "514295328";
  console.log("Company org:", companyOrg);

  // Setup: create supplier first so EHF matches
  const acct = await get("/ledger/account?number=6590,2400&fields=id,number");
  const acc6590 = acct!.values.find((a: any) => a.number === 6590);
  const acc2400 = acct!.values.find((a: any) => a.number === 2400);

  const supp = await post("/supplier", {
    name: SUPP_NAME,
    organizationNumber: SUPP_ORG,
    isSupplier: true,
    postalAddress: { addressLine1: "Testgate 1", postalCode: "0150", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "Testgate 1", postalCode: "0150", city: "Oslo", country: { id: 161 } },
  });
  const suppId = supp!.value.id;
  const suppLedgerAcctId = supp!.value.ledgerAccount?.id;
  console.log("Supplier:", suppId, "ledgerAccount:", suppLedgerAcctId);

  // Create project for cost linkage
  const dept = await get("/department?isInactive=false&count=1&fields=id");
  const pmAss = await get("/employee?assignableProjectManagers=true&count=1&fields=id");
  const cust = await post("/customer", { name: "EHFTest Cust " + TS, organizationNumber: "970096531", isCustomer: true });
  const proj = await post("/project", {
    name: "EHFTest Project " + TS,
    startDate: TODAY,
    customer: { id: cust!.value.id },
    projectManager: { id: pmAss!.values[0].id },
    isFixedPrice: true,
    fixedprice: 265000,
  });
  const pId = proj!.value.id;
  console.log("Project:", pId);

  // Import document
  const invoiceNumber = `SI-${TS}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>${TODAY}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${SUPP_ORG}</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID schemeID="0192">${SUPP_ORG}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${SUPP_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0150</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${SUPP_ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPP_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${SUPP_ORG}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${companyOrg}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Our Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgate 2</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0150</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Our Company</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${companyOrg}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>12345678903</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${SUPP_COST}.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${SUPP_COST}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${SUPP_COST}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${SUPP_COST}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${SUPP_COST}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${SUPP_COST}.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Leverandørkostnad prosjekt</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${SUPP_COST}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, "invoice.xml");

  const r = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const b = await r.json();
  console.log(`POST /ledger/voucher/importDocument → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); return; }

  const voucherId = b.values[0].id;
  const voucherVersion = b.values[0].version;
  console.log("Voucher ID:", voucherId, "version:", voucherVersion);

  // Check supplier invoice entity
  const siRes = await get(`/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*`);
  const mysi = siRes?.values?.find((s: any) => s.voucher?.id === voucherId);
  console.log("\nSupplier Invoice entity:", mysi ? JSON.stringify(mysi, null, 2).slice(0, 2000) : "NOT FOUND");

  if (mysi) {
    // Try to set project on SI
    console.log("\n=== PUT SI with project ===");
    const putSi = await put(`/supplierInvoice/${mysi.id}`, {
      ...mysi,
      project: { id: pId },
    });
    if (putSi) {
      console.log("SI with project:", putSi.value?.project);
    }
  }

  // Update voucher postings with project + correct accounts
  console.log("\n=== UPDATE VOUCHER POSTINGS ===");
  const vch = await get(`/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  console.log("Current voucher:", JSON.stringify(vch?.value, null, 2).slice(0, 1000));

  if (vch?.value) {
    // Set postings with project reference
    const putVch = await put(`/ledger/voucher/${voucherId}?sendToLedger=false`, {
      version: vch.value.version,
      postings: [
        {
          row: 1,
          date: TODAY,
          description: `${SUPP_NAME} - leverandørkostnad`,
          account: { id: acc6590!.id },
          amount: SUPP_COST,
          amountCurrency: SUPP_COST,
          amountGross: SUPP_COST,
          amountGrossCurrency: SUPP_COST,
          project: { id: pId },
        },
        {
          row: 2,
          date: TODAY,
          description: `${SUPP_NAME} - leverandørkostnad`,
          account: { id: suppLedgerAcctId || acc2400!.id },
          supplier: { id: suppId },
          amount: -SUPP_COST,
          amountCurrency: -SUPP_COST,
          amountGross: -SUPP_COST,
          amountGrossCurrency: -SUPP_COST,
          invoiceNumber: invoiceNumber,
          termOfPayment: TODAY,
        },
      ],
    });
    if (putVch) {
      console.log("Postings updated, version:", putVch.value?.version);

      // Book it
      const bookVch = await put(`/ledger/voucher/${voucherId}?sendToLedger=true`, {
        version: putVch.value.version,
        voucherType: { name: "Leverandørfaktura" },
      });
      if (bookVch) {
        console.log("Booked! number:", bookVch.value?.number);
      }
    }

    // Verify final state
    const vchFinal = await get(`/ledger/voucher/${voucherId}?fields=*,postings(*)`);
    console.log("\nFinal voucher:", JSON.stringify(vchFinal?.value, null, 2).slice(0, 2000));

    // Check SI again
    const siResAfter = await get(`/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*`);
    const mysiAfter = siResAfter?.values?.find((s: any) => s.voucher?.id === voucherId);
    console.log("\nSI after booking:", JSON.stringify(mysiAfter, null, 2)?.slice(0, 2000));
  }
}

main().catch(e => console.error("FATAL:", e.message));
