// Test alternative approaches for task 11 (supplier invoice)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) {
    opts.body = body;
    opts.headers = { Authorization: AUTH };
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  const TS = Date.now();
  const SUPPLIER_NAME = `TestSupplier_${TS}`;
  const ORG = "890932991";
  const INVOICE_NUM = `INV-${TS}`;
  const GROSS = 59800;
  const NET = 47840;
  const VAT = 11960;
  const DATE = "2026-03-21";

  // Create supplier
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG,
  });
  const supplierId = supRes.data?.value?.id;
  const supplierLedgerAccountId = supRes.data?.value?.ledgerAccount?.id;
  console.log("Supplier:", supplierId, "LedgerAccount:", supplierLedgerAccountId);

  // Get expense account 6300
  const accRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = accRes.data?.values?.[0]?.id;
  console.log("Expense account:", expenseAccountId);

  // ========== TEST 1: Try POST /supplierInvoice directly ==========
  console.log("\n=== TEST 1: POST /supplierInvoice directly ===");
  const directRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: INVOICE_NUM + "-direct",
    invoiceDate: DATE,
    invoiceDueDate: DATE,
    supplier: { id: supplierId },
    amount: GROSS,
    amountCurrency: GROSS,
    orders: JSON.stringify([{
      account: { id: expenseAccountId },
      description: "Office services",
      vatType: { id: 1 },
      amount: NET,
      amountCurrency: NET,
      amountGross: GROSS,
      amountGrossCurrency: GROSS,
    }]),
  });
  console.log("Direct POST result:", JSON.stringify(directRes.data, null, 2).slice(0, 1000));

  // ========== TEST 2: Import + sendToLedger=true ==========
  console.log("\n=== TEST 2: Import + sendToLedger=true ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUM}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Unknown</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
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
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
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
      <cbc:Name>Office services</cbc:Name>
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
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NUM}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", formData);
  const voucherId = importRes.data?.values?.[0]?.id;
  const voucherVersion = importRes.data?.values?.[0]?.version;
  console.log("Import voucher:", voucherId, "version:", voucherVersion);

  // PUT with sendToLedger=TRUE
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: "Office services",
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
        description: "Office services",
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NUM,
        termOfPayment: DATE,
      },
    ],
  });
  console.log("PUT sendToLedger=true:", putRes.status);
  if (putRes.status >= 400) {
    console.log("PUT ERROR:", JSON.stringify(putRes.data, null, 2).slice(0, 500));
  }

  // Check resulting voucher state
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  console.log("Voucher number:", vRes.data?.value?.number);
  console.log("Voucher numberAsString:", vRes.data?.value?.numberAsString);
  console.log("Voucher date:", vRes.data?.value?.date);
  console.log("Postings count:", vRes.data?.value?.postings?.length);

  // Check the supplierInvoice
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=${DATE}&invoiceDateTo=${DATE}&supplierId=${supplierId}&fields=*`);
  console.log("\nSupplierInvoice count:", siRes.data?.values?.length);
  if (siRes.data?.values?.length > 0) {
    for (const si of siRes.data.values) {
      console.log(`  SI id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount} voucher=${si.voucher?.id} paymentTypeId=${si.paymentTypeId}`);
      console.log(`  invoiceDate=${si.invoiceDate} dueDate=${si.invoiceDueDate} supplier=${si.supplier?.id}`);
    }
  }

  // ========== TEST 3: PUT the supplierInvoice directly ==========
  if (siRes.data?.values?.length > 0) {
    const siId = siRes.data.values[0].id;
    const siVersion = siRes.data.values[0].version;
    console.log("\n=== TEST 3: PUT /supplierInvoice to update fields ===");
    const siPutRes = await api("PUT", `/supplierInvoice/${siId}`, {
      id: siId,
      version: siVersion,
      invoiceNumber: INVOICE_NUM,
      invoiceDate: DATE,
      invoiceDueDate: DATE,
      supplier: { id: supplierId },
      amount: GROSS,
      amountCurrency: GROSS,
    });
    console.log("PUT supplierInvoice:", siPutRes.status);
    console.log("Result:", JSON.stringify(siPutRes.data, null, 2).slice(0, 1000));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
