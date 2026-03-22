/**
 * Task 11 Investigation: Does BOOKING break the supplierInvoice state?
 *
 * Hypothesis: booking the voucher changes the supplierInvoice object in a way
 * that breaks all 4 scorer checks.
 *
 * Test: Create two identical supplier invoices via EHF import.
 * - Invoice A: set postings only (sendToLedger=false) — NO booking
 * - Invoice B: set postings + book (sendToLedger=true)
 * Compare the supplierInvoice objects.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, Accept: "application/json" };
  if (!isFormData && body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}: ${text.substring(0, 300)}`);
    throw new Error(`${res.status}`);
  }
  console.log(`${method} ${path} => ${res.status}`);
  return JSON.parse(text);
}

const uid = Date.now().toString(36);
const orgNumber = "848657514";
const date = "2026-03-22";
const dueDate = "2026-04-22";
const gross = 50000;
const net = 40000;

function buildXml(invoiceNumber: string, supplierName: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
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
    <cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">40000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">40000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">40000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">50000</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">50000</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">40000</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>kontortjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">40000</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function createAndExamine(label: string, invoiceNumber: string, book: boolean) {
  console.log(`\n========== ${label} (book=${book}) ==========\n`);

  // Create supplier
  const supplierName = `${label}-${uid}`;
  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  const supplierId = supplierRes.value.id;
  const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;

  // Get expense account
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = acctRes.values[0].id;

  // Import EHF
  const xml = buildXml(invoiceNumber, supplierName);
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  const voucherId = importRes.values[0].id;
  const voucherVersion = importRes.values[0].version;

  // Set postings
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: "kontortjenester",
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: "kontortjenester",
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumber,
        termOfPayment: dueDate,
      },
    ],
  });
  const newVersion = putRes.value.version;

  // Optionally book
  if (book) {
    const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
      version: newVersion,
    });
    console.log(`  Booked, number=${bookRes.value.number}`);
  } else {
    console.log(`  NOT booked (sendToLedger=false only)`);
  }

  // Now read the supplierInvoice
  const siSearch = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);

  if (siSearch.values && siSearch.values.length > 0) {
    const si = siSearch.values[0];
    console.log(`\n  --- SupplierInvoice ---`);
    console.log(`  id: ${si.id}`);
    console.log(`  invoiceNumber: ${si.invoiceNumber}`);
    console.log(`  invoiceDate: ${si.invoiceDate}`);
    console.log(`  invoiceDueDate: ${si.invoiceDueDate}`);
    console.log(`  amount: ${si.amount}`);
    console.log(`  amountCurrency: ${si.amountCurrency}`);
    console.log(`  amountExcludingVat: ${si.amountExcludingVat}`);
    console.log(`  amountExcludingVatCurrency: ${si.amountExcludingVatCurrency}`);
    console.log(`  supplier.id: ${si.supplier?.id}`);
    console.log(`  supplier.name: ${si.supplier?.name}`);
    console.log(`  supplier.organizationNumber: ${si.supplier?.organizationNumber}`);
    console.log(`  voucher.id: ${si.voucher?.id}`);
    console.log(`  voucher.number: ${si.voucher?.number}`);
    console.log(`  voucher.numberAsString: ${si.voucher?.numberAsString}`);
    console.log(`  isCreditNote: ${si.isCreditNote}`);
    console.log(`  outstandingAmount: ${si.outstandingAmount}`);
    console.log(`  currency.id: ${si.currency?.id}`);
    console.log(`  orderLines count: ${si.orderLines?.length ?? 0}`);
    if (si.orderLines?.length > 0) {
      for (const ol of si.orderLines) {
        console.log(`    orderLine: description=${ol.description}, unitCostCurrency=${ol.unitCostCurrency}, amountExcludingVatCurrency=${ol.amountExcludingVatCurrency}, amountIncludingVatCurrency=${ol.amountIncludingVatCurrency}`);
      }
    }
    console.log(`  voucher postings: ${si.voucher?.postings?.length ?? 0}`);
    if (si.voucher?.postings) {
      for (const p of si.voucher.postings) {
        console.log(`    posting: row=${p.row}, account.number=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}, supplier=${p.supplier?.id}, vatType=${p.vatType?.id}, invoiceNumber=${p.invoiceNumber}`);
      }
    }
    console.log(`  ALL KEYS: ${Object.keys(si).join(', ')}`);

    // Print the full SI as JSON for detailed comparison
    console.log(`\n  FULL JSON (selected fields):`);
    console.log(JSON.stringify({
      id: si.id,
      invoiceNumber: si.invoiceNumber,
      invoiceDate: si.invoiceDate,
      invoiceDueDate: si.invoiceDueDate,
      amount: si.amount,
      amountCurrency: si.amountCurrency,
      amountExcludingVat: si.amountExcludingVat,
      amountExcludingVatCurrency: si.amountExcludingVatCurrency,
      isCreditNote: si.isCreditNote,
      outstandingAmount: si.outstandingAmount,
      kidOrReceiverReference: si.kidOrReceiverReference,
      originalInvoiceDocumentId: si.originalInvoiceDocumentId,
      supplier: { id: si.supplier?.id, name: si.supplier?.name, organizationNumber: si.supplier?.organizationNumber },
      voucher: { id: si.voucher?.id, number: si.voucher?.number, date: si.voucher?.date },
      orderLines: si.orderLines?.map((ol: any) => ({
        description: ol.description,
        count: ol.count,
        unitCostCurrency: ol.unitCostCurrency,
        amountExcludingVatCurrency: ol.amountExcludingVatCurrency,
        amountIncludingVatCurrency: ol.amountIncludingVatCurrency,
      })),
    }, null, 2));
  } else {
    console.log(`  NO supplierInvoice found!`);
  }

  // Also check the voucher directly
  console.log(`\n  --- Voucher ---`);
  const vDetail = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  const v = vDetail.value;
  console.log(`  number: ${v.number}`);
  console.log(`  numberAsString: ${v.numberAsString}`);
  console.log(`  description: ${v.description}`);
  console.log(`  date: ${v.date}`);
}

async function main() {
  await createAndExamine("UNBOOKED", `INV-NOBOOK-${uid}`, false);
  await createAndExamine("BOOKED", `INV-BOOKED-${uid}`, true);
  console.log("\n\n=== COMPARISON COMPLETE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
