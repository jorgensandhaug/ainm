// Task 29 investigation part 5:
// Test creating a proper supplier invoice using importDocument
// Also investigate the project ID mismatch in projectInvoiceDetails

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T29e-${Date.now()}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 500)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function apiForm(path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await r.text();
  if (!r.ok) {
    console.log(`POST ${path} → ${r.status}: ${text.slice(0, 500)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function main() {
  // Check projectInvoiceDetails project ID issue
  // The invoice created with project X shows projectInvoiceDetails.project.id = X+1
  // This means the POST /invoice creates an intermediate order/project - the link might be wrong

  console.log("=== INVESTIGATION: Invoice project linkage ===\n");

  // First, let's look at how POST /invoice works with the project
  // The invoice wraps an orders[] array, each order has a project
  // But Tripletex might create SEPARATE internal project/order objects

  // Let's focus on the supplier invoice question instead - more impactful

  console.log("\n=== SUPPLIER INVOICE VIA VOUCHER/IMPORT ===\n");

  // Create supplier
  const supR = await api("POST", "/supplier", {
    name: `Lysgård ${SUFFIX}`,
    organizationNumber: "964716188",
    isSupplier: true,
  });
  const supplierId = supR.data?.value?.id;
  const supplierLedgerAccountId = supR.data?.value?.ledgerAccount?.id;
  console.log(`Supplier: ${supplierId}, ledgerAccount: ${supplierLedgerAccountId}`);

  // Get expense account (let's use a general one - 6300 or similar)
  const acctR = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  let expenseAccountId: number | undefined;
  if (acctR.data?.values?.length > 0) {
    expenseAccountId = acctR.data.values[0].id;
    console.log(`Expense account 6300: id=${expenseAccountId}`);
  } else {
    // Try broader search
    const acctR2 = await api("GET", "/ledger/account?isApplicableForSupplierInvoice=true&fields=*&count=20");
    console.log("Available expense accounts:");
    for (const a of (acctR2.data?.values || []).slice(0, 10)) {
      console.log(`  ${a.number} ${a.name} id=${a.id}`);
    }
    expenseAccountId = acctR2.data?.values?.[0]?.id;
  }

  // Build minimal EHF XML
  const invoiceNumber = `INV-${SUFFIX}`;
  const netAmount = 56200;
  const vatPct = 25;
  const vatAmount = netAmount * vatPct / 100;
  const grossAmount = netAmount + vatAmount;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>2026-04-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">964716188</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Lysgård ${SUFFIX}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO964716188MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Lysgård ${SUFFIX}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">964716188</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Our Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Vår gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Our Company</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vatAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${netAmount}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vatAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatPct}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${netAmount}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${netAmount}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${grossAmount}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${grossAmount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${netAmount}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Leverandørkostnad</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatPct}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${netAmount}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  // Import via /ledger/voucher/importDocument
  const blob = new Blob([xml], { type: "application/xml" });
  const formData = new FormData();
  formData.append("file", blob, `${invoiceNumber}.xml`);

  console.log(`\nImporting supplier invoice XML...`);
  const importR = await apiForm("/ledger/voucher/importDocument", formData);

  if (!importR.ok) {
    console.log("Import failed!");
    return;
  }

  const voucherId = importR.data?.values?.[0]?.id;
  const voucherVersion = importR.data?.values?.[0]?.version;
  console.log(`Voucher imported: id=${voucherId}, version=${voucherVersion}`);

  // PUT to add postings
  const putR = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: "Leverandørkostnad",
        vatType: { id: 1 },
        amount: netAmount,
        amountCurrency: netAmount,
        amountGross: grossAmount,
        amountGrossCurrency: grossAmount,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: "Leverandørkostnad",
        amount: -grossAmount,
        amountCurrency: -grossAmount,
        amountGross: -grossAmount,
        amountGrossCurrency: -grossAmount,
        invoiceNumber: invoiceNumber,
        termOfPayment: "2026-04-20",
      },
    ],
  });

  if (putR.ok) {
    console.log(`\nVoucher updated successfully!`);
    // Read back the supplier invoice
    const siR = await api("GET", `/supplierInvoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&supplierId=${supplierId}&fields=*`);
    console.log(`\nSupplier invoices found: ${siR.data?.values?.length}`);
    for (const si of siR.data?.values || []) {
      console.log(`  id=${si.id} number=${si.invoiceNumber} amount=${si.amount} amountCurrency=${si.amountCurrency}`);
    }
  }

  // NOW: What if we also need the supplier cost linked to the PROJECT?
  // The importDocument approach creates a supplier invoice but doesn't link it to the project
  // Maybe we need BOTH: orderline (for project cost) + supplier invoice (for proper accounting)?
  // Or maybe the scoring only checks one of them?

  console.log("\n\n=== QUESTION: Does scoring check project.costCurrency or supplierInvoice? ===");
  console.log("=== We may need to do BOTH or find a way to link the invoice to the project ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
