const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "KhtBA0qPvXkipHWF0L2h_3STQt4-ACJGeecrStbSMFQ";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any, isFormData?: boolean) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isFormData) headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`<<< ${res.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); throw new Error(`${res.status}`); }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Invoice data from PDF
const SUPPLIER_NAME = "Silveroak Ltd";
const ORG_NR = "980649512";
const INVOICE_NR = "INV-2026-4261";
const INVOICE_DATE = "2026-01-08";
const DUE_DATE = "2026-02-07";
const DESCRIPTION = "Datautstyr";
const NET = 68850;
const GROSS = 86062;
const VAT_AMOUNT = 17212;
const EXPENSE_ACCOUNT = 6540;

async function main() {
  // Step 1: Create supplier with address + bank
  const supplier = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
    postalAddress: {
      addressLine1: "Solveien 150",
      postalCode: "7010",
      city: "Trondheim",
    },
    bankAccountPresentation: [{ bban: "37231445375" }],
  });
  const supplierId = supplier.id;
  const supplierLedgerAccountId = supplier.ledgerAccount.id;
  console.log(`Supplier created: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: Get expense account
  const accounts = await api("GET", `/ledger/account?number=${EXPENSE_ACCOUNT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccount = Array.isArray(accounts) ? accounts[0] : accounts;
  const expenseAccountId = expenseAccount.id;
  console.log(`Expense account: id=${expenseAccountId}, number=${expenseAccount.number}`);

  // Step 3: Get incoming VAT type for 25%
  const vatTypes = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${INVOICE_DATE}&fields=*`);
  const vatList = Array.isArray(vatTypes) ? vatTypes : [vatTypes];
  // Prefer number="1" for ordinary 25% incoming
  const vat25 = vatList.find((v: any) => v.percentage === 25 && v.number === "1")
    || vatList.find((v: any) => v.percentage === 25);
  if (!vat25) throw new Error("No 25% incoming VAT type found");
  const vatTypeId = vat25.id;
  console.log(`VAT type: id=${vatTypeId}, number=${vat25.number}, percentage=${vat25.percentage}`);

  // Step 4: Import EHF/UBL XML invoice
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
      <cac:PartyName>
        <cbc:Name>${SUPPLIER_NAME}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Solveien 150</cbc:StreetName>
        <cbc:CityName>Trondheim</cbc:CityName>
        <cbc:PostalZone>7010</cbc:PostalZone>
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
        <cbc:Name>Ditt firma</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
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

  const formData = new FormData();
  const xmlBlob = new Blob([xml], { type: "application/xml" });
  formData.append("file", xmlBlob, `${INVOICE_NR}.xml`);

  // importDocument returns list wrapper: { values: [...] }
  const importResult = await api("POST", "/ledger/voucher/importDocument", formData, true);
  const voucher = Array.isArray(importResult) ? importResult[0] : importResult;
  const voucherId = voucher.id;
  const voucherVersion = voucher.version;
  console.log(`Voucher imported: id=${voucherId}, version=${voucherVersion}`);

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

  const result = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, putBody);
  console.log("\nFinal voucher postings:");
  if (result.postings) {
    for (const p of result.postings) {
      console.log(`  row=${p.row} account=${p.account?.number || p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.number || "none"} supplier=${p.supplier?.id || "none"}`);
    }
  }
  console.log("\nDone. 5 calls total.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
