// Investigate task 11 (supplier invoice) - what does the scorer see after our flow?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, extraHeaders?: Record<string, string>) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: extraHeaders ? { ...H, ...extraHeaders } : H,
  };
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
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 500));
  }
  return { status: res.status, data: json };
}

// Use unique names to avoid collision
const SUPPLIER_NAME = `InvestigateSupplier_${Date.now()}`;
const ORG_NUMBER = "890932991"; // from production task
const INVOICE_NUMBER = `INV-TEST-${Date.now()}`;
const GROSS = 59800;
const NET = 47840;
const VAT_AMOUNT = 11960;
const EXPENSE_ACCOUNT = 6300;
const DESCRIPTION = "Office services";
const DATE = "2026-03-21";

async function main() {
  console.log("=== SUPPLIER INVOICE INVESTIGATION ===\n");

  // Step 1: Create supplier
  const supplierRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NUMBER,
  });
  const supplierId = supplierRes.data?.value?.id;
  const supplierLedgerAccountId = supplierRes.data?.value?.ledgerAccount?.id;
  console.log("Supplier ID:", supplierId, "Ledger Account ID:", supplierLedgerAccountId);

  // Step 2: Get expense account
  const accountRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCOUNT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = accountRes.data?.values?.[0]?.id;
  console.log("Expense Account ID:", expenseAccountId);

  // Step 3: Import XML invoice
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUMBER}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NUMBER}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Unknown</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NUMBER}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NUMBER}</cbc:CompanyID>
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
    <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
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
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NUMBER}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", formData);
  const voucherId = importRes.data?.values?.[0]?.id;
  const voucherVersion = importRes.data?.values?.[0]?.version;
  console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

  // Step 4: PUT voucher with postings
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
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
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: DESCRIPTION,
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NUMBER,
        termOfPayment: DATE,
      },
    ],
  });
  console.log("PUT postings:", putRes.status);

  console.log("\n=== NOW CHECK WHAT THE SCORER WOULD SEE ===\n");

  // Check supplierInvoice objects
  const siRes = await api("GET", `/supplierInvoice?supplierId=${supplierId}&fields=*`);
  console.log("SupplierInvoice search:", JSON.stringify(siRes.data?.values?.map((si: any) => ({
    id: si.id,
    invoiceNumber: si.invoiceNumber,
    amount: si.amount,
    amountCurrency: si.amountCurrency,
    supplier: si.supplier?.id,
    voucher: si.voucher?.id,
    paymentTypeId: si.paymentTypeId,
    invoiceDate: si.invoiceDate,
    invoiceDueDate: si.invoiceDueDate,
  })), null, 2));

  // Check the voucher postings
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  console.log("\nVoucher state:", JSON.stringify({
    id: vRes.data?.value?.id,
    description: vRes.data?.value?.description,
    date: vRes.data?.value?.date,
    number: vRes.data?.value?.number,
    postingsCount: vRes.data?.value?.postings?.length,
    postings: vRes.data?.value?.postings?.map((p: any) => ({
      row: p.row,
      account: p.account?.id,
      amount: p.amount,
      amountGross: p.amountGross,
      vatType: p.vatType?.id,
      supplier: p.supplier?.id,
      invoiceNumber: p.invoiceNumber,
      systemGenerated: p.systemGenerated,
    })),
  }, null, 2));

  // Check supplier state
  const supRes = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log("\nSupplier state:", JSON.stringify({
    id: supRes.data?.value?.id,
    name: supRes.data?.value?.name,
    organizationNumber: supRes.data?.value?.organizationNumber,
    email: supRes.data?.value?.email,
    invoiceEmail: supRes.data?.value?.invoiceEmail,
    postalAddress: supRes.data?.value?.postalAddress,
    bankAccountPresentation: supRes.data?.value?.bankAccountPresentation,
  }, null, 2));

  // Check if there's a supplierInvoice linked to the voucher
  const siByVoucher = await api("GET", `/supplierInvoice?voucherId=${voucherId}&fields=*`);
  console.log("\nSupplierInvoice by voucher:", JSON.stringify(siByVoucher.data?.values?.length));

  // Also check supplierInvoice by invoice number
  const siByNumber = await api("GET", `/supplierInvoice?invoiceNumber=${INVOICE_NUMBER}&fields=*`);
  console.log("SupplierInvoice by invoiceNumber:", JSON.stringify(siByNumber.data?.values?.length));

  // Try to read the supplierInvoice with ALL fields
  if (siRes.data?.values?.length > 0) {
    const siId = siRes.data.values[0].id;
    const fullSi = await api("GET", `/supplierInvoice/${siId}?fields=*`);
    console.log("\nFull SupplierInvoice:", JSON.stringify(fullSi.data?.value, null, 2).slice(0, 2000));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
