/**
 * Try the BETA endpoint with more format variations
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isFormData = false): Promise<{ok: boolean, status: number, data: any}> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, Accept: "application/json" };
  if (!isFormData && body) headers["Content-Type"] = "application/json; charset=utf-8";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  console.log(`${method} ${path} => ${res.status}`);
  if (!res.ok) console.log(`  ERR: ${text.substring(0, 400)}`);
  return { ok: res.ok, status: res.status, data };
}

const uid = Date.now().toString(36);
const orgNumber = "848657514";
const date = "2026-03-22";

async function main() {
  const supplierRes = await api("POST", "/supplier", { name: `BV3-${uid}`, organizationNumber: orgNumber });
  const supplierId = supplierRes.data.value.id;
  const supplierLedgerAccountId = supplierRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = acctRes.data.values[0].id;

  const invoiceNumber = `INV-BV3-${uid}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>BV3-${uid}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Storgata 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>BV3-${uid}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">40000</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">40000</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">40000</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">50000</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">50000</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">40000</cbc:LineExtensionAmount><cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">40000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  const voucherId = importRes.data.values[0].id;

  const siSearch = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*,orderLines(*)`);
  const orderLineId = siSearch.data.values?.[0]?.orderLines?.[0]?.id;
  const siId = siSearch.data.values?.[0]?.id;

  // Attempts with the beta endpoint
  const attempts = [
    {
      label: "Attempt 1: account only, no vatType, with description",
      body: [{ orderLine: { id: orderLineId }, posting: { account: { id: expenseAccountId }, description: "kontortjenester", amount: 40000, amountGross: 50000, amountCurrency: 40000, amountGrossCurrency: 50000 } }]
    },
    {
      label: "Attempt 2: vatType id=0 (no VAT)",
      body: [{ orderLine: { id: orderLineId }, posting: { row: 1, account: { id: expenseAccountId }, description: "kontortjenester", vatType: { id: 0 }, amount: 50000, amountGross: 50000 } }]
    },
    {
      label: "Attempt 3: Just the account ref, let Tripletex figure out amounts",
      body: [{ orderLine: { id: orderLineId }, posting: { account: { id: expenseAccountId } } }]
    },
  ];

  for (const attempt of attempts) {
    console.log(`\n--- ${attempt.label} ---`);
    const r = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, attempt.body);
    if (r.ok) {
      console.log("  SUCCESS!");
      console.log(`  SI amount: ${r.data.value?.amount}`);

      // Read final state
      const finalSi = await api("GET", `/supplierInvoice/${siId}?fields=*,voucher(*,postings(*)),orderLines(*)`);
      if (finalSi.ok) {
        const f = finalSi.data.value;
        console.log(`  Final SI amount: ${f.amount}`);
        console.log(`  voucher postings: ${f.voucher?.postings?.length}`);
        if (f.voucher?.postings) {
          for (const p of f.voucher.postings) {
            console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}, vatType=${p.vatType?.id}`);
          }
        }
      }
      break;
    }
  }

  // Also try a completely different approach: what if we use the regular PUT /ledger/voucher
  // but include the `date` field in postings which we didn't have before?
  console.log("\n\n--- Attempt: Regular PUT /ledger/voucher with date on postings ---");
  // Need fresh import for this
  const form2 = new FormData();
  const inv2 = `INV-BV3B-${uid}`;
  const xml2 = xml.replace(invoiceNumber, inv2);
  form2.append("file", new Blob([xml2], { type: "application/xml" }), `${inv2}.xml`);
  const supplier2Res = await api("POST", "/supplier", { name: `BV3B-${uid}`, organizationNumber: orgNumber });
  const supplier2Id = supplier2Res.data.value.id;
  const supplier2LedgerAccountId = supplier2Res.data.value.ledgerAccount.id;
  const importRes2 = await api("POST", "/ledger/voucher/importDocument", form2, true);
  const voucher2Id = importRes2.data.values[0].id;
  const voucher2Version = importRes2.data.values[0].version;

  // Regular PUT with explicit date
  const putRes = await api("PUT", `/ledger/voucher/${voucher2Id}?sendToLedger=false`, {
    version: voucher2Version,
    date: date,
    postings: [
      {
        row: 1,
        date: date,
        account: { id: expenseAccountId },
        description: "kontortjenester",
        vatType: { id: 1 },
        amount: 40000,
        amountCurrency: 40000,
        amountGross: 50000,
        amountGrossCurrency: 50000,
      },
      {
        row: 2,
        date: date,
        account: { id: supplier2LedgerAccountId },
        supplier: { id: supplier2Id },
        description: "kontortjenester",
        amount: -50000,
        amountCurrency: -50000,
        amountGross: -50000,
        amountGrossCurrency: -50000,
        invoiceNumber: inv2,
        termOfPayment: date,
      },
    ],
  });

  if (putRes.ok) {
    const newVersion = putRes.data.value.version;

    // Now book
    const bookRes = await api("PUT", `/ledger/voucher/${voucher2Id}?sendToLedger=true`, { version: newVersion });
    if (bookRes.ok) {
      console.log(`  Booked, number=${bookRes.data.value.number}`);
    }

    // Read back SI
    const si2Search = await api("GET", `/supplierInvoice?supplierId=${supplier2Id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*,voucher(*,postings(*)),orderLines(*)`);
    if (si2Search.ok && si2Search.data.values?.length > 0) {
      const si = si2Search.data.values[0];
      console.log(`  SI id: ${si.id}`);
      console.log(`  SI invoiceNumber: ${si.invoiceNumber}`);
      console.log(`  SI amount: ${si.amount}`);
      console.log(`  SI voucher.number: ${si.voucher?.number}`);
      console.log(`  SI orderLines: ${si.orderLines?.length}`);
      if (si.orderLines) {
        for (const ol of si.orderLines) {
          console.log(`    orderLine: desc=${ol.description}, unitCost=${ol.unitCostCurrency}, exVat=${ol.amountExcludingVatCurrency}, incVat=${ol.amountIncludingVatCurrency}, account=${ol.account?.id || ol.account?.number || 'null'}`);
        }
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
