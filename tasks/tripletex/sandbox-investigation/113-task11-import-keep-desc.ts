/**
 * Task 11 — importDocument + PUT postings WITHOUT changing description.
 *
 * Key question: Can we PUT postings on an imported voucher if we keep
 * the auto-generated description unchanged?
 *
 * If yes: importDocument creates supplierInvoice entity + we set correct
 * postings + book → scorer might pass on the entity checks.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any, isForm = false) {
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  const ok = res.status < 400;
  console.log(`  ${ok ? '✓' : '✗'} ${method} ${path} → ${res.status}`);
  if (!ok) console.log(`    ${JSON.stringify(data).slice(0, 500)}`);
  return { status: res.status, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 32650;
  const net = 26120;
  const vat = 6530;
  const invoiceNumber = "INV-2026-KEEPDESC";
  const promptDescription = "kontortjenester";
  const supplierName = "Keepdesc Test AS";
  const supplierOrg = "889157917"; // valid mod11
  const buyerOrg = "514295328"; // our company

  // Setup: get or create supplier
  const supLookup = await api("GET", `/supplier?organizationNumber=${supplierOrg}&fields=id,name,ledgerAccount(id)`);
  let supplierId: number, supplierLedgerAccountId: number;
  if (supLookup.data.values?.length > 0) {
    supplierId = supLookup.data.values[0].id;
    supplierLedgerAccountId = supLookup.data.values[0].ledgerAccount.id;
  } else {
    const supRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: supplierOrg });
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
  }

  const acctRes = await api("GET", "/ledger/account?number=7300&isApplicableForSupplierInvoice=true&fields=id,number");
  const expenseAccountId = acctRes.data.values[0].id;

  // ── importDocument ──
  console.log("\n── importDocument ──");
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
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${supplierOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${supplierOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${supplierOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${buyerOrg}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Buyer Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Dreggsallmenningen 7</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${buyerOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${buyerOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${promptDescription}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);

  if (importRes.status >= 400) {
    console.log("FATAL: importDocument failed");
    return;
  }

  const v = importRes.data.values?.[0];
  const voucherId = v.id;
  let version = v.version;
  const autoDesc = v.description;
  console.log(`  Voucher: id=${voucherId} version=${version} desc="${autoDesc}" number=${v.number}`);

  // ── Check what postings exist after import ──
  console.log("\n── Current voucher state after import ──");
  const vState = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
  if (vState.status < 400) {
    const vv = vState.data.value;
    console.log(`  postings: ${vv.postings?.length || 0}`);
    for (const p of vv.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name}`);
    }
  }

  // ── TEST A: PUT with SAME description + postings ──
  console.log(`\n── TEST A: PUT keeping original description + adding postings ──`);
  const putA = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    description: autoDesc,  // KEEP the auto-generated description
    postings: [
      {
        row: 1, date, description: promptDescription,
        account: { id: expenseAccountId }, vatType: { id: 1 }, currency: { id: 1 },
        amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: promptDescription,
        account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, currency: { id: 1 },
        amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: date,
      },
    ],
  });

  if (putA.status < 400) {
    version = putA.data.value.version;
    console.log(`  PUT succeeded! version=${version} desc="${putA.data.value.description}"`);
  } else {
    // Try without description field at all
    console.log(`\n── TEST B: PUT without description field ──`);
    const putB = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
      version,
      postings: [
        {
          row: 1, date, description: promptDescription,
          account: { id: expenseAccountId }, vatType: { id: 1 }, currency: { id: 1 },
          amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross,
        },
        {
          row: 2, date, description: promptDescription,
          account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, currency: { id: 1 },
          amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
          invoiceNumber, termOfPayment: date,
        },
      ],
    });

    if (putB.status < 400) {
      version = putB.data.value.version;
      console.log(`  PUT B succeeded! version=${version} desc="${putB.data.value.description}"`);
    }
  }

  // ── Book ──
  console.log("\n── Book ──");
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  if (bookRes.status < 400) {
    version = bookRes.data.value.version;
    console.log(`  Booked: number=${bookRes.data.value.number} desc="${bookRes.data.value.description}"`);
  }

  // ── Full readback ──
  console.log("\n── Full readback ──");

  // supplierInvoice
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=${invoiceNumber}&fields=*,voucher(*,postings(*,account(*),vatType(*))),supplier(*)`);
  for (const si of siRes.data.values || []) {
    console.log(`\n  SupplierInvoice id=${si.id}:`);
    console.log(`    invoiceNumber: "${si.invoiceNumber}"`);
    console.log(`    invoiceDate: ${si.invoiceDate}`);
    console.log(`    invoiceDueDate: ${si.invoiceDueDate}`);
    console.log(`    amount: ${si.amount}`);
    console.log(`    amountCurrency: ${si.amountCurrency}`);
    console.log(`    amountExcludingVat: ${si.amountExcludingVat}`);
    console.log(`    outstandingAmount: ${si.outstandingAmount}`);
    console.log(`    supplier: id=${si.supplier?.id} name="${si.supplier?.name}" org="${si.supplier?.organizationNumber}"`);
    console.log(`    voucher: id=${si.voucher?.id} number=${si.voucher?.number}`);
    console.log(`    voucher.description: "${si.voucher?.description}"`);
    for (const p of si.voucher?.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name}`);
    }
  }

  // Direct voucher readback
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
  if (vRead.status < 400) {
    const rv = vRead.data.value;
    console.log(`\n  Voucher: desc="${rv.description}" number=${rv.number}`);
    for (const p of rv.postings || []) {
      console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'-'} inv=${p.invoiceNumber||'-'}`);
    }
  }

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  await api("PUT", `/ledger/voucher/${voucherId}/:reverse?date=${date}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
