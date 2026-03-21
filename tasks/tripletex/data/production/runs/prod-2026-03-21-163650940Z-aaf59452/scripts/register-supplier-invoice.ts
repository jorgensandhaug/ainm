const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Lyi8ScCmXHN1TSUvNOYGkiGBr06eOPkVcDJElkS5QTU";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any, contentType?: string) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (contentType) {
    opts.headers["Content-Type"] = contentType;
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
  }
  if (body) {
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  console.log(`\n>>> ${method} ${url}`);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  console.log(`<<< ${resp.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!resp.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2));
    throw new Error(`${resp.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Invoice data from PDF
const SUPPLIER_NAME = "Luna SL";
const ORG_NR = "966941901";
const INVOICE_NR = "INV-2026-7337";
const INVOICE_DATE = "2026-03-13";
const DUE_DATE = "2026-04-12";
const DESCRIPTION = "Programvarelisens";
const NET = 38900;
const VAT_AMT = 9725;
const GROSS = 48625;
const EXPENSE_ACCOUNT = 6340;

async function main() {
  // Step 1: Create supplier
  const supplier = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
    postalAddress: {
      addressLine1: "Fjordveien 86",
      postalCode: "3015",
      city: "Drammen",
    },
    bankAccountPresentation: [{ bban: "36204404121" }],
  });
  const supplierId = supplier.id;
  const supplierLedgerAccountId = supplier.ledgerAccount.id;
  console.log("Supplier ID:", supplierId, "Ledger Account ID:", supplierLedgerAccountId);

  // Step 2: Get expense account
  const accounts = await api("GET", `/ledger/account?number=${EXPENSE_ACCOUNT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccount = Array.isArray(accounts) ? accounts[0] : accounts;
  const expenseAccountId = expenseAccount.id;
  console.log("Expense Account ID:", expenseAccountId);

  // Step 3: Get incoming VAT type
  const vatTypes = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${INVOICE_DATE}&fields=*`);
  const vatList = Array.isArray(vatTypes) ? vatTypes : [vatTypes];
  const vat25 = vatList.find((v: any) => v.percentage === 25 && v.number === "1")
    || vatList.find((v: any) => v.percentage === 25);
  const vatTypeId = vat25.id;
  console.log("VAT Type ID:", vatTypeId, "Number:", vat25.number, "Percentage:", vat25.percentage);

  // Step 4: Import EHF XML document
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${INVOICE_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Fjordveien 86</cbc:StreetName>
        <cbc:CityName>Drammen</cbc:CityName>
        <cbc:PostalZone>3015</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMT}.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESCRIPTION}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, "invoice.xml");

  const importUrl = `${BASE}/ledger/voucher/importDocument`;
  console.log(`\n>>> POST ${importUrl}`);
  const importResp = await fetch(importUrl, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importText = await importResp.text();
  console.log(`<<< ${importResp.status}`);
  let importJson: any;
  try { importJson = JSON.parse(importText); } catch { importJson = importText; }
  if (!importResp.ok) {
    console.log("IMPORT ERROR:", JSON.stringify(importJson, null, 2));
    throw new Error(`Import failed: ${importResp.status}`);
  }
  console.log("Import response keys:", Object.keys(importJson));

  // CRITICAL: importDocument returns list wrapper { values: [...] }, NOT { value: {...} }
  const voucher = importJson.values[0];
  const voucherId = voucher.id;
  const voucherVersion = voucher.version;
  console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

  // Step 5: PUT voucher with correct postings
  const putBody = {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: DESCRIPTION,
        vatType: { id: vatTypeId },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: DESCRIPTION,
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR,
        termOfPayment: DUE_DATE,
      },
    ],
  };

  const updatedVoucher = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, putBody);
  console.log("\nFinal voucher postings:");
  if (updatedVoucher.postings) {
    for (const p of updatedVoucher.postings) {
      console.log(`  row=${p.row} account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.number} supplier=${p.supplier?.id}`);
    }
  }
  console.log("\nDone. 5 API calls total.");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
