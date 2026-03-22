// Test whether we can use account: { number: 6300 } instead of account: { id: X }
// If this works, we can eliminate the GET /ledger/account call

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa(`0:${TOKEN}`)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // First, get account 6300 ID the normal way for comparison
  const accRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  console.log("Account 6300 by GET:", JSON.stringify(accRes.values?.[0]?.id));

  // Now test: can we use account number in a voucher posting?
  // We'll create a simple test by doing importDocument and then PUT with account: { number: 6300 }

  // Create a test supplier
  const suppRes = await api("POST", "/supplier", {
    name: "SBX AcctTest " + Date.now(),
    organizationNumber: "987654321",
    postalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
    bankAccountPresentation: [{ bban: "11287374218" }]
  });
  const suppId = suppRes.value?.id;
  const suppLedgerAcctId = suppRes.value?.ledgerAccount?.id;
  console.log("Supplier created:", suppId, "ledgerAccount.id:", suppLedgerAcctId);

  // Create importDocument
  const invoiceNum = "ACCTTEST-" + Date.now();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNum}</cbc:ID>
  <cbc:IssueDate>2026-04-29</cbc:IssueDate>
  <cbc:DueDate>2026-05-29</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">987654321</cbc:EndpointID>
      <cac:PartyName><cbc:Name>SBX AcctTest</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO987654321MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>SBX AcctTest</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">987654321</cbc:CompanyID>
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
    <cbc:TaxAmount currencyID="NOK">5512</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">22050</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">5512</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">22050</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">22050</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">27562</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">27562</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">22050</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>IT-konsulenttjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">22050</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNum}.xml`);
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impJson = await impRes.json();
  console.log("importDocument →", impRes.status);
  const voucherId = impJson.values?.[0]?.id;
  const voucherVersion = impJson.values?.[0]?.version;
  console.log("Voucher:", voucherId, "version:", voucherVersion);

  // TEST 1: Try account: { number: 6300 } (no id)
  console.log("\n--- TEST 1: account: { number: 6300 } ---");
  const putRes1 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: "2026-04-29",
        description: "IT-konsulenttjenester",
        account: { number: 6300 },  // <-- TEST: using number instead of id
        vatType: { id: 1 },
        amount: 22050,
        amountCurrency: 22050,
        amountGross: 27562,
        amountGrossCurrency: 27562,
      },
      {
        row: 2,
        date: "2026-04-29",
        description: "IT-konsulenttjenester",
        account: { id: suppLedgerAcctId },
        supplier: { id: suppId },
        amount: -27562,
        amountCurrency: -27562,
        amountGross: -27562,
        amountGrossCurrency: -27562,
        invoiceNumber: invoiceNum,
        termOfPayment: "2026-05-29",
      }
    ]
  });

  if (putRes1.value) {
    console.log("SUCCESS! account: { number: 6300 } WORKED");
    console.log("Posting account:", JSON.stringify(putRes1.value.postings?.find((p: any) => p.row === 1)?.account));
  } else {
    console.log("FAILED:", JSON.stringify(putRes1).slice(0, 500));
  }
}

main().catch(console.error);
