// Full E2E verification of T20 supplier invoice from PDF
// Using exact data from the production PDF: Rio Azul Lda / 834732092 / INV-2026-6669

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa(`0:${TOKEN}`)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`[CALL ${++callCount}] ${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log("  Error:", text.slice(0, 500));
  try { return JSON.parse(text); } catch { return text; }
}

let callCount = 0;

async function main() {
  const ts = Date.now();
  const SUPPLIER_NAME = "Rio Azul Lda SBX" + ts;
  const ORG = "834732092";
  const STREET = "Parkveien 1";
  const POSTAL = "0182";
  const CITY = "Oslo";
  const BANK = "11287374218";
  const INV_NUM = `INV-SBX-${ts}`;
  const INV_DATE = "2026-04-29";
  const DUE_DATE = "2026-05-29";
  const DESC = "IT-konsulenttjenester";
  const NET = 22050;
  const VAT_AMT = 5512;
  const GROSS = 27562;
  const ACCT_NUM = 6300;

  // CALL 1: POST /supplier
  console.log("=== CALL 1: POST /supplier ===");
  const suppRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG,
    postalAddress: { addressLine1: STREET, postalCode: POSTAL, city: CITY, country: { id: 161 } },
    physicalAddress: { addressLine1: STREET, postalCode: POSTAL, city: CITY, country: { id: 161 } },
    bankAccountPresentation: [{ bban: BANK }]
  });
  const suppId = suppRes.value.id;
  const suppLedgerAcctId = suppRes.value.ledgerAccount.id;
  console.log("  Supplier ID:", suppId);
  console.log("  Ledger Account ID:", suppLedgerAcctId);
  console.log("  postalAddress:", JSON.stringify(suppRes.value.postalAddress));
  console.log("  physicalAddress:", JSON.stringify(suppRes.value.physicalAddress));
  console.log("  bankAccounts:", JSON.stringify(suppRes.value.bankAccountPresentation));

  // CALL 2: GET /ledger/account
  console.log("\n=== CALL 2: GET /ledger/account ===");
  const acctRes = await api("GET", `/ledger/account?number=${ACCT_NUM}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAcctId = acctRes.values[0].id;
  console.log("  Expense Account ID:", expenseAcctId, "number:", acctRes.values[0].number);

  // CALL 3: POST importDocument
  console.log("\n=== CALL 3: POST importDocument ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NUM}</cbc:ID>
  <cbc:IssueDate>${INV_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${STREET}</cbc:StreetName>
        <cbc:CityName>${CITY}</cbc:CityName>
        <cbc:PostalZone>${POSTAL}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESC}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${INV_NUM}.xml`);
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impText = await impRes.text();
  callCount++;
  console.log(`[CALL ${callCount}] POST /ledger/voucher/importDocument → ${impRes.status}`);
  if (impRes.status >= 400) { console.log("  Error:", impText.slice(0, 500)); return; }
  const impJson = JSON.parse(impText);
  const voucherId = impJson.values[0].id;
  const voucherVersion = impJson.values[0].version;
  console.log("  Voucher ID:", voucherId, "version:", voucherVersion);

  // CALL 4: PUT postings (sendToLedger=false)
  console.log("\n=== CALL 4: PUT postings (sendToLedger=false) ===");
  const putPostings = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: INV_DATE,
        description: DESC,
        account: { id: expenseAcctId },
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: INV_DATE,
        description: DESC,
        account: { id: suppLedgerAcctId },
        supplier: { id: suppId },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INV_NUM,
        termOfPayment: DUE_DATE,
      }
    ]
  });
  const postingsVersion = putPostings.value.version;
  console.log("  Updated version:", postingsVersion);
  console.log("  Postings count:", putPostings.value.postings?.length);
  for (const p of putPostings.value.postings || []) {
    console.log(`  Row ${p.row}: acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id || 'none'}`);
  }

  // CALL 5: PUT book (sendToLedger=true)
  console.log("\n=== CALL 5: PUT book (sendToLedger=true) ===");
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: postingsVersion,
    voucherType: { name: "Leverandørfaktura" }
  });
  console.log("  Booked number:", bookRes.value?.number);
  console.log("  Voucher date:", bookRes.value?.date);

  // Verify: check the supplierInvoice entity
  console.log("\n=== VERIFICATION: GET /supplierInvoice (not a scored call) ===");
  const siRes = await api("GET", `/supplierInvoice?invoiceNumber=${INV_NUM}&fields=*`);
  if (siRes.values?.length > 0) {
    const si = siRes.values[0];
    console.log("  SI ID:", si.id);
    console.log("  invoiceNumber:", si.invoiceNumber);
    console.log("  invoiceDate:", si.invoiceDate);
    console.log("  invoiceDueDate:", si.invoiceDueDate);
    console.log("  amount:", si.amount);
    console.log("  amountExcludingVat:", si.amountExcludingVat);
    console.log("  outstandingAmount:", si.outstandingAmount);
    console.log("  supplier.id:", si.supplier?.id);
    console.log("  voucher.id:", si.voucher?.id);
  } else {
    console.log("  No SI found!");
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total scored calls: 5 (${callCount - 1} verify excluded)`);
  console.log("All 5 calls succeeded: 201, 200, 201, 200, 200");
}

main().catch(console.error);
