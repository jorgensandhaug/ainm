// Test: can we use account: { number: 6300 } in postings to eliminate GET /ledger/account?

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
  if (res.status >= 400) console.log("  Error:", text.slice(0, 500));
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // Get account ID for comparison
  const accRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const acctId = accRes.values?.[0]?.id;
  console.log("Account 6300 ID:", acctId);

  // Use an existing supplier in sandbox
  const suppRes = await api("GET", "/supplier?name=Oakwood&fields=*&count=1");
  let suppId: number, suppLedgerAcctId: number;
  if (suppRes.values?.length > 0) {
    suppId = suppRes.values[0].id;
    suppLedgerAcctId = suppRes.values[0].ledgerAccount?.id;
    console.log("Using existing supplier:", suppId, "ledgerAcct:", suppLedgerAcctId);
  } else {
    console.log("No existing supplier found, creating one...");
    const createRes = await api("POST", "/supplier", {
      name: "SBX Test " + Date.now(),
      postalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
      physicalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
    });
    suppId = createRes.value.id;
    suppLedgerAcctId = createRes.value.ledgerAccount?.id;
  }

  // Create importDocument with unique invoice number
  const ts = Date.now();
  const invoiceNum = `ACCTTEST-${ts}`;
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
      <cbc:EndpointID schemeID="0192">834732092</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Test Supplier</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Parkveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0182</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO834732092MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Test Supplier</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">834732092</cbc:CompanyID>
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
  const impText = await impRes.text();
  console.log(`POST importDocument → ${impRes.status}`);
  if (impRes.status >= 400) { console.log("  Error:", impText.slice(0, 500)); return; }
  const impJson = JSON.parse(impText);
  const voucherId = impJson.values[0].id;
  const voucherVersion = impJson.values[0].version;
  console.log("Voucher:", voucherId, "version:", voucherVersion);

  // TEST A: Use account: { number: 6300 } (no id)
  console.log("\n--- TEST A: account: { number: 6300 } ---");
  const putResA = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: "2026-04-29",
        description: "IT-konsulenttjenester",
        account: { number: 6300 },
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

  if (putResA.value) {
    console.log("SUCCESS! account: { number: 6300 } WORKED");
    const posting1 = putResA.value.postings?.find((p: any) => p.row === 1);
    console.log("Posting row 1 account:", JSON.stringify(posting1?.account));
    console.log("Posting row 1 amount:", posting1?.amount, "amountGross:", posting1?.amountGross);
  } else {
    console.log("Failed — need account.id after all");
    // If it failed, retry with account: { id }
    console.log("\n--- TEST B: account: { id: " + acctId + " } ---");
    const putResB = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
      version: voucherVersion,
      postings: [
        {
          row: 1,
          date: "2026-04-29",
          description: "IT-konsulenttjenester",
          account: { id: acctId },
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
    if (putResB.value) {
      console.log("account: { id } works as expected");
      // Now try to book
      const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
        version: putResB.value.version,
        voucherType: { name: "Leverandørfaktura" }
      });
      if (bookRes.value) {
        console.log("Booked! Number:", bookRes.value.number);
      }
    }
  }
}

main().catch(console.error);
