const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "t6OZHB0jVRgpcD0xaeMYB6h5uJhCWx0JKTiLp6oVv_k";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const JSON_H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: isFormData ? { Authorization: AUTH } : JSON_H,
  };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.log("ERROR:", text);
    throw new Error(`${r.status}`);
  }
  return JSON.parse(text);
}

// === Invoice data from PDF ===
const SUPPLIER_NAME = "Nordlicht GmbH";
const ORG_NR = "871162069";
const STREET = "Nygata 53";
const POSTAL = "9008";
const CITY = "Tromsø";
const BBAN = "28390913577";

const INV_NR = "INV-2026-7611";
const INV_DATE = "2026-04-06";
const DUE_DATE = "2026-05-06";
const DESCRIPTION = "Nettverkstjenester";
const NET = 35650;
const VAT = 8912;
const GROSS = 44562;
const EXPENSE_ACCT = 6300;

async function main() {
  // Step 1: POST /supplier (with physicalAddress + country + bankAccountPresentation)
  const addr = {
    addressLine1: STREET,
    postalCode: POSTAL,
    city: CITY,
    country: { id: 161 },
  };
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
    postalAddress: addr,
    physicalAddress: addr,
    bankAccountPresentation: [{ bban: BBAN }],
  });
  const supplierId = supRes.value.id;
  console.log("Supplier ID:", supplierId);

  // Step 2: GET expense account ID (need { id } for postings, not { number })
  const acctRes = await api(
    "GET",
    `/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`
  );
  const expenseAccountId = acctRes.values[0].id;
  console.log("Expense account ID:", expenseAccountId);

  // Step 3: POST /ledger/voucher/importDocument with EHF/UBL XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NR}</cbc:ID>
  <cbc:IssueDate>${INV_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${STREET}</cbc:StreetName>
        <cbc:CityName>${CITY}</cbc:CityName>
        <cbc:PostalZone>${POSTAL}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID>
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
    <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
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
      <cbc:Name>${DESCRIPTION}</cbc:Name>
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
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${INV_NR}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
  const voucherId = importRes.values[0].id;
  const importVersion = importRes.values[0].version;
  console.log("Voucher ID:", voucherId, "Version:", importVersion);

  // Extract supplier ledger account (2400) from the import response's existing postings
  let supplierAccountId: number | undefined;
  const importedVoucher = importRes.values[0];
  if (importedVoucher.postings) {
    for (const p of importedVoucher.postings) {
      if (p.account && p.account.number === 2400) {
        supplierAccountId = p.account.id;
        break;
      }
    }
  }
  console.log("Supplier account ID from import:", supplierAccountId);

  // If not found in import response, we need a fallback GET (makes it 6 calls)
  if (!supplierAccountId) {
    const sup2400 = await api("GET", "/ledger/account?number=2400&fields=id,number");
    supplierAccountId = sup2400.values[0].id;
    console.log("Supplier account ID from GET:", supplierAccountId);
  }

  // Step 4: PUT postings with sendToLedger=false
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: importVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: DESCRIPTION,
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        account: { id: supplierAccountId },
        supplier: { id: supplierId },
        description: DESCRIPTION,
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INV_NR,
        termOfPayment: DUE_DATE,
      },
    ],
  });
  const putVersion = putRes.value.version;
  console.log("Postings set, version:", putVersion);

  // Step 5: Book with sendToLedger=true
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: putVersion,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log("Booked! Voucher number:", bookRes.value.number);
  console.log("DONE.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
