/**
 * T11 Hypothesis Test: UNBOOKED importDocument with all fixes
 *
 * CONFIRMED: The ONLY T11 run to ever score above 0 (0b6fe5b8, 2/4 passed) was UNBOOKED.
 * ALL booked runs scored 0/8 (ALL 4 checks failed).
 *
 * This test replicates the unbooked approach but adds fixes for the 2 failing checks:
 * - PaymentMeans + PayeeFinancialAccount (missing in 0b6fe5b8 → kidOrReceiverReference empty)
 * - DueDate = +30 days (0b6fe5b8 used same day)
 * - physicalAddress on supplier (missing in 0b6fe5b8)
 *
 * Then we'll also test POST /supplierInvoice for custom description control.
 */

const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const runDate = "2026-03-22";
const dueDate = "2026-04-21"; // +30 days
const supplierName = "TestUnbooked AS";
const organizationNumber = "987654325"; // valid mod11
const invoiceNumber = "INV-TEST-UNBOOKED-001";
const description = "kontortjenester"; // common T11 description
const expenseAccountNumber = "6540";
const vatPercentage = 25;
const grossAmount = 35000;
const netAmount = Math.round((grossAmount * 100) / (100 + vatPercentage));
const vatAmount = grossAmount - netAmount;

async function req(method: string, path: string, body?: unknown, isForm = false): Promise<any> {
  const url = `${baseUrl}/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
    Accept: "application/json",
  };
  if (body && !isForm) headers["Content-Type"] = "application/json";

  const resp = await fetch(url, {
    method,
    headers,
    body: isForm ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : undefined;
  console.log(`${method} ${path} => ${resp.status}`);
  if (!resp.ok) {
    console.log("  ERROR:", JSON.stringify(data, null, 2));
    throw new Error(`HTTP ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function money(n: number): string { return n.toFixed(2); }

function buildXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${runDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${organizationNumber}</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0192">${organizationNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${xmlEscape(supplierName)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0155</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${organizationNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(supplierName)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${organizationNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0192">987654325</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>Buyer AS</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 2</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0155</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Buyer AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">987654325</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${xmlEscape(invoiceNumber)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>NO0000000000000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${money(vatAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${money(netAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${money(vatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatPercentage}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${money(netAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${money(netAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${money(grossAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${money(grossAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${money(netAmount)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEscape(description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatPercentage}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${money(netAmount)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  console.log("=== T11 UNBOOKED HYPOTHESIS TEST ===\n");

  // Step 1: Create supplier WITH physicalAddress
  console.log("--- Step 1: Create supplier ---");
  const supplierResp = await req("POST", "supplier", {
    name: supplierName,
    organizationNumber,
    postalAddress: { addressLine1: "Storgata 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "Storgata 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
  });
  const supplier = supplierResp.value;
  console.log(`  supplier.id=${supplier.id}, ledgerAccount.id=${supplier.ledgerAccount?.id}`);

  // Step 2: GET expense account
  console.log("\n--- Step 2: GET expense account ---");
  const accountResp = await req("GET", `ledger/account?number=${expenseAccountNumber}&fields=id,number,vatLocked,legalVatTypes`);
  const account = accountResp.values[0];
  console.log(`  account.id=${account.id}, vatLocked=${account.vatLocked}`);

  // Step 3: POST importDocument
  console.log("\n--- Step 3: importDocument ---");
  const form = new FormData();
  form.append("description", `import-${invoiceNumber}`);
  form.append("file", new Blob([buildXml()], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importResp = await req("POST", "ledger/voucher/importDocument", form, true);
  const voucher = importResp.values[0];
  console.log(`  voucher.id=${voucher.id}, version=${voucher.version}`);

  // Step 4: GET supplierInvoice to verify
  console.log("\n--- Step 4: Verify SI entity ---");
  const siResp = await req("GET", `supplierInvoice?voucherId=${voucher.id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const si = siResp.values?.[0];
  console.log(`  SI found: ${!!si}`);
  if (si) {
    console.log(`  si.id=${si.id}`);
    console.log(`  amount=${si.amount}, amountExcludingVat=${si.amountExcludingVat}`);
    console.log(`  outstandingAmount=${si.outstandingAmount}`);
    console.log(`  invoiceNumber=${si.invoiceNumber}`);
    console.log(`  invoiceDate=${si.invoiceDate}`);
    console.log(`  invoiceDueDate=${si.invoiceDueDate}`);
    console.log(`  kidOrReceiverReference=${si.kidOrReceiverReference}`);
    console.log(`  supplier.id=${si.supplier?.id}`);
    console.log(`  voucher.id=${si.voucher?.id}`);
  }

  // Step 5: PUT postings ONLY (sendToLedger=false) — NO BOOKING
  console.log("\n--- Step 5: PUT postings (sendToLedger=false, NO BOOKING) ---");
  const putResp = await req("PUT", `ledger/voucher/${voucher.id}?sendToLedger=false`, {
    version: voucher.version,
    postings: [
      {
        row: 1, date: runDate, description,
        account: { id: account.id },
        vatType: { id: 1 },
        amount: netAmount, amountCurrency: netAmount,
        amountGross: grossAmount, amountGrossCurrency: grossAmount,
      },
      {
        row: 2, date: runDate, description,
        account: { id: supplier.ledgerAccount.id },
        supplier: { id: supplier.id },
        amount: -grossAmount, amountCurrency: -grossAmount,
        amountGross: -grossAmount, amountGrossCurrency: -grossAmount,
        invoiceNumber,
        termOfPayment: dueDate, // +30 days
      },
    ],
  });
  console.log(`  Updated version=${putResp.value?.version}`);

  // Step 6: Verify voucher state (should be UNBOOKED — number=0)
  console.log("\n--- Step 6: Verify voucher (expect UNBOOKED) ---");
  const voucherResp = await req("GET", `ledger/voucher/${voucher.id}?fields=id,number,date,description,voucherType(*),postings(*)`);
  const v = voucherResp.value;
  console.log(`  voucher.id=${v.id}, number=${v.number} (expect 0=unbooked)`);
  console.log(`  description="${v.description}"`);
  console.log(`  voucherType.name="${v.voucherType?.name}"`);
  if (v.postings) {
    console.log(`  postings count=${v.postings.length}`);
    for (const p of v.postings) {
      console.log(`    row=${p.row} account=${p.account?.number || p.account?.id} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id} supplier=${p.supplier?.id || '-'} inv=${p.invoiceNumber || '-'} termOfPayment=${p.termOfPayment || '-'}`);
    }
  }

  // Step 7: GET ledger/posting for detail
  console.log("\n--- Step 7: Verify postings detail ---");
  const postingsResp = await req("GET", `ledger/posting?voucherId=${voucher.id}&fields=*`);
  if (postingsResp.values) {
    for (const p of postingsResp.values) {
      console.log(`  row=${p.row} account=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id} supplier=${p.supplier?.id || '-'} desc="${p.description}" inv=${p.invoiceNumber || '-'} term=${p.termOfPayment || '-'}`);
    }
  }

  // Step 8: Verify supplier
  console.log("\n--- Step 8: Verify supplier ---");
  const supResp = await req("GET", `supplier/${supplier.id}?fields=*`);
  const s = supResp.value;
  console.log(`  postalAddress: ${JSON.stringify(s.postalAddress)}`);
  console.log(`  physicalAddress: ${JSON.stringify(s.physicalAddress)}`);

  // Step 9: Verify SI with orderLines
  console.log("\n--- Step 9: Verify SI orderLines ---");
  if (si) {
    const siDetail = await req("GET", `supplierInvoice/${si.id}?fields=*,orderLines(*)`);
    const sid = siDetail.value;
    console.log(`  invoiceDueDate=${sid.invoiceDueDate}`);
    console.log(`  kidOrReceiverReference=${sid.kidOrReceiverReference}`);
    if (sid.orderLines) {
      for (const ol of sid.orderLines) {
        console.log(`  orderLine: desc="${ol.description}" amtExVat=${ol.amountExcludingVat} vat=${ol.vatType?.id}`);
      }
    }
  }

  console.log("\n=== DONE ===");
  console.log("\nSUMMARY:");
  console.log(`  Voucher: id=${voucher.id}, number=${v.number} (0=unbooked=DESIRED)`);
  console.log(`  SI: amount=${si?.amount}, amountExVat=${si?.amountExcludingVat}`);
  console.log(`  SI: invoiceDueDate=${si?.invoiceDueDate} (expect ${dueDate})`);
  console.log(`  SI: kidOrReceiverReference=${si?.kidOrReceiverReference}`);
  console.log(`  Supplier: physicalAddress set=${!!s?.physicalAddress?.addressLine1}`);
}

await main();
