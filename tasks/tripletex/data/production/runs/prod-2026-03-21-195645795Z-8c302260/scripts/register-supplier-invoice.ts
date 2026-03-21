const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "cF16KU8MOZHjGEhIM03uPM3Bob85WDVCkpqo9Nde0XA";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, contentType?: string) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { ...headers } };
  if (contentType) opts.headers["Content-Type"] = contentType;
  if (body !== undefined) opts.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log("ERROR:", text); throw new Error(`${res.status} ${text}`); }
  return text ? JSON.parse(text) : null;
}

async function apiFormData(path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await res.text();
  console.log(`POST ${path} → ${res.status}`);
  if (!res.ok) { console.log("ERROR:", text); throw new Error(`${res.status} ${text}`); }
  return text ? JSON.parse(text) : null;
}

// Constants
const SUPPLIER_NAME = "Waldstein GmbH";
const ORG_NR = "927720523";
const INVOICE_NR = "INV-2026-6337";
const DATE = "2026-03-21";
const DESCRIPTION = "Bürodienstleistungen";
const GROSS = 55950;
const NET = 44760; // 55950 / 1.25
const VAT = 11190;
const EXPENSE_ACCOUNT = 7000;

async function main() {
  // Step 1: POST /supplier
  const supplierRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
  });
  const supplierId = supplierRes.value.id;
  const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;
  console.log(`Supplier created: id=${supplierId}, ledgerAccountId=${supplierLedgerAccountId}`);

  // Step 2: GET /ledger/account
  const accountRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCOUNT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccount = accountRes.values[0];
  const expenseAccountId = expenseAccount.id;
  console.log(`Expense account: id=${expenseAccountId}, number=${expenseAccount.number}, name=${expenseAccount.name}`);

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
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
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>${SUPPLIER_NAME}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Hauptstraße 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
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
      <cac:PartyName>
        <cbc:Name>Buyer Company AS</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Buyer Street 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Buyer Company AS</cbc:RegistrationName>
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
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
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
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const blob = new Blob([xml], { type: "application/xml" });
  const formData = new FormData();
  formData.append("file", blob, `${INVOICE_NR}.xml`);

  const importRes = await apiFormData("/ledger/voucher/importDocument", formData);
  // CRITICAL: importDocument returns { values: [...] }, NOT { value: {...} }
  const voucher = importRes.values[0];
  const voucherId = voucher.id;
  let voucherVersion = voucher.version;
  console.log(`Imported voucher: id=${voucherId}, version=${voucherVersion}`);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false (set postings)
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESCRIPTION,
        account: { id: expenseAccountId },
        vatType: { id: 1 }, // 25% incoming VAT, hardcoded
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESCRIPTION,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR,
        termOfPayment: DATE,
      },
    ],
  });
  voucherVersion = putRes.value.version;
  console.log(`Postings set: version=${voucherVersion}, number=${putRes.value.number}`);
  console.log("Postings:", JSON.stringify(putRes.value.postings?.map((p: any) => ({
    row: p.row, account: p.account?.number, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
  }))));

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true (book the voucher, version only, NO postings)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: voucherVersion,
  });
  const finalVersion = bookRes.value.version;
  const finalNumber = bookRes.value.number;
  console.log(`Voucher booked: id=${voucherId}, version=${finalVersion}, number=${finalNumber}`);
  console.log("DONE - 5 calls, 0 errors expected");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
