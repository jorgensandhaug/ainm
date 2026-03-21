// Test: can we use account: { number: 6590 } instead of account: { id: ... } in PUT postings?
// If yes, we can skip the GET /ledger/account call entirely.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: isFormData ? { Authorization: AUTH } : headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(text.slice(0, 500)); }
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function main() {
  // Create a test supplier
  const suppRes = await api("POST", "/supplier", {
    name: "Sandbox Test Account Ref AS",
    organizationNumber: "999517862",
  });
  if (suppRes.status !== 201) { console.log("Supplier create failed"); return; }
  const supplierId = suppRes.data.value.id;
  const supplierLedgerAccountId = suppRes.data.value.ledgerAccount.id;
  console.log(`Supplier id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Import a test EHF XML
  const NET = 10000;
  const GROSS = 12500;
  const VAT_AMT = 2500;
  const DATE = "2026-03-21";
  const INVOICE_NR = "SBX-ACCT-REF-001";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999517862</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999517862MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Sandbox Test Account Ref AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999517862</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Kundeveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Buyer AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID>
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
      <cbc:Name>test services</cbc:Name>
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
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NR}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
  if (importRes.status !== 201) { console.log("Import failed"); return; }
  const voucherId = importRes.data.values[0].id;
  let version = importRes.data.values[0].version;
  console.log(`Voucher id=${voucherId}, version=${version}`);

  // TEST: Use account: { number: 6590 } instead of account: { id: ... }
  console.log("\n=== TEST: account by number ===");
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    postings: [
      {
        row: 1,
        account: { number: 6590 },  // <-- BY NUMBER, not by id
        description: "test services",
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: "test services",
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR,
        termOfPayment: DATE,
      },
    ],
  });

  if (putRes.status === 200) {
    console.log("SUCCESS: account by number works!");
    version = putRes.data.value.version;
    const postings = putRes.data.value.postings?.map((p: any) => ({
      row: p.row,
      accountNumber: p.account?.number,
      accountId: p.account?.id,
      amount: p.amount,
      amountGross: p.amountGross
    }));
    console.log("Postings:", JSON.stringify(postings, null, 2));

    // Now book it
    const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
    if (bookRes.status === 200) {
      console.log(`Booked! number=${bookRes.data.value.number}`);
    }
  } else {
    console.log("FAILED: account by number does not work");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
