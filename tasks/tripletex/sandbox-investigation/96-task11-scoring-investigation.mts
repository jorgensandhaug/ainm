/**
 * Task 11 scoring investigation
 *
 * Goal: understand WHY the EHF import approach scores 0/8 on ALL recent runs
 * and what the scorer checks.
 *
 * Approach: create a supplier invoice via EHF import (same as production),
 * then examine the resulting supplierInvoice object in detail to compare
 * against what the scorer likely checks.
 *
 * Also test: POST /supplierInvoice direct endpoint as an alternative.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isFormData && body) headers["Content-Type"] = "application/json";
  headers["Accept"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`);
    console.error(text.substring(0, 500));
    throw new Error(`${res.status}`);
  }
  console.log(`${method} ${path} => ${res.status}`);
  return JSON.parse(text);
}

const uid = Date.now().toString(36);
const supplierName = `InvTest-${uid}`;
const orgNumber = "848657514";
const invoiceNumber = `INV-TEST-${uid}`;
const description = "kontortjenester";
const gross = 50000;
const net = 40000;
const vatAmt = 10000;
const expenseAccount = 6300;
const date = "2026-03-22";
const dueDate = "2026-04-22";

async function main() {
  console.log("=== PHASE 1: EHF Import approach (same as production) ===\n");

  // Step 1: POST /supplier
  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  const supplierId = supplierRes.value.id;
  const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;
  console.log(`  Supplier: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: GET /ledger/account
  const acctRes = await api("GET", `/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctRes.values[0].id;
  console.log(`  Expense account: id=${expenseAccountId}`);

  // Step 3: POST /ledger/voucher/importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
        <cbc:StreetName>Hovedgata 1</cbc:StreetName>
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
    <cbc:TaxAmount currencyID="NOK">${vatAmt}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vatAmt}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  const voucherId = importRes.values[0].id;
  const voucherVersion = importRes.values[0].version;
  console.log(`  Voucher: id=${voucherId}, version=${voucherVersion}`);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description,
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
        description,
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: dueDate,
      },
    ],
  });
  const newVersion = putRes.value.version;
  console.log(`  Postings set, version=${newVersion}`);

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true (book)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: newVersion,
  });
  console.log(`  Booked, number=${bookRes.value.number}`);

  // === NOW EXAMINE THE STATE ===
  console.log("\n=== EXAMINING SUPPLIER INVOICE STATE (EHF import) ===\n");

  // Look up the supplierInvoice by supplierId
  const siSearch = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);
  console.log(`\n  supplierInvoice search: ${siSearch.fullResultSize} results`);

  if (siSearch.values && siSearch.values.length > 0) {
    for (const si of siSearch.values) {
      console.log(`\n  --- SupplierInvoice id=${si.id} ---`);
      console.log(`  invoiceNumber: ${si.invoiceNumber}`);
      console.log(`  invoiceDate: ${si.invoiceDate}`);
      console.log(`  dueDate: ${si.dueDate ?? si.invoiceDueDate}`);
      console.log(`  amount: ${si.amount}`);
      console.log(`  amountCurrency: ${si.amountCurrency}`);
      console.log(`  amountRoundoff: ${si.amountRoundoff}`);
      console.log(`  supplier.id: ${si.supplier?.id}`);
      console.log(`  supplier.name: ${si.supplier?.name}`);
      console.log(`  supplier.organizationNumber: ${si.supplier?.organizationNumber}`);
      console.log(`  voucher.id: ${si.voucher?.id}`);
      console.log(`  voucher.number: ${si.voucher?.number}`);
      console.log(`  currency.id: ${si.currency?.id}`);
      console.log(`  currency.code: ${si.currency?.code}`);
      console.log(`  isCreditNote: ${si.isCreditNote}`);
      console.log(`  supplierVoucherType: ${si.supplierVoucherType}`);
      console.log(`  orderLines count: ${si.orderLines?.length ?? 0}`);
      if (si.orderLines?.length > 0) {
        for (const ol of si.orderLines) {
          console.log(`    orderLine: id=${ol.id}, description=${ol.description}, count=${ol.count}, unitCostCurrency=${ol.unitCostCurrency}, amountExcludingVatCurrency=${ol.amountExcludingVatCurrency}, amountIncludingVatCurrency=${ol.amountIncludingVatCurrency}`);
        }
      }
      console.log(`  voucher postings: ${si.voucher?.postings?.length ?? 0}`);
      if (si.voucher?.postings) {
        for (const p of si.voucher.postings) {
          console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}, supplier=${p.supplier?.id}, vatType=${p.vatType?.id}`);
        }
      }

      // Print ALL fields
      console.log(`\n  FULL SI object keys: ${Object.keys(si).join(', ')}`);
    }
  }

  // Also check if the voucher itself shows anything different
  console.log("\n=== VOUCHER DETAILS ===");
  const voucherDetail = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  const v = voucherDetail.value;
  console.log(`  id: ${v.id}`);
  console.log(`  number: ${v.number}`);
  console.log(`  date: ${v.date}`);
  console.log(`  description: ${v.description}`);
  console.log(`  typeId: ${v.typeId}`);
  console.log(`  type: ${JSON.stringify(v.type)}`);
  console.log(`  postings: ${v.postings?.length}`);
  for (const p of (v.postings ?? [])) {
    console.log(`    row=${p.row}, account.number=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}, supplier.id=${p.supplier?.id}, invoiceNumber=${p.invoiceNumber}, termOfPayment=${p.termOfPayment}`);
  }

  // === PHASE 2: Direct POST /supplierInvoice with orderLines ===
  console.log("\n\n=== PHASE 2: Direct POST /supplierInvoice (with orderLines) ===\n");

  const directInvNumber = `INV-DIRECT-${uid}`;

  try {
    const directRes = await api("POST", "/supplierInvoice", {
      invoiceNumber: directInvNumber,
      invoiceDate: date,
      invoiceDueDate: dueDate,
      supplier: { id: supplierId },
      currency: { id: 1 },  // NOK
      voucher: {
        date: date,
        description: `Direct invoice ${directInvNumber}`,
      },
      orderLines: [
        {
          description: description,
          count: 1,
          unitCostCurrency: net,
          vatType: { id: 1 },
          amountExcludingVatCurrency: net,
          amountIncludingVatCurrency: gross,
        },
      ],
    });

    console.log(`  Direct SI created, id=${directRes.value.id}`);
    const dsi = directRes.value;
    console.log(`  invoiceNumber: ${dsi.invoiceNumber}`);
    console.log(`  amount: ${dsi.amount}`);
    console.log(`  amountCurrency: ${dsi.amountCurrency}`);
    console.log(`  supplier.id: ${dsi.supplier?.id}`);
    console.log(`  voucher.id: ${dsi.voucher?.id}`);

    // Now get full details
    const dsiDetail = await api("GET", `/supplierInvoice/${dsi.id}?fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);
    const d = dsiDetail.value;
    console.log(`\n  --- Direct SupplierInvoice details ---`);
    console.log(`  invoiceNumber: ${d.invoiceNumber}`);
    console.log(`  amount: ${d.amount}`);
    console.log(`  amountCurrency: ${d.amountCurrency}`);
    console.log(`  supplier.id: ${d.supplier?.id}`);
    console.log(`  supplier.name: ${d.supplier?.name}`);
    console.log(`  voucher.id: ${d.voucher?.id}`);
    console.log(`  voucher.number: ${d.voucher?.number}`);
    console.log(`  isCreditNote: ${d.isCreditNote}`);
    console.log(`  supplierVoucherType: ${d.supplierVoucherType}`);
    console.log(`  orderLines: ${d.orderLines?.length ?? 0}`);
    if (d.orderLines?.length > 0) {
      for (const ol of d.orderLines) {
        console.log(`    orderLine: id=${ol.id}, description=${ol.description}, count=${ol.count}, unitCostCurrency=${ol.unitCostCurrency}, amountExcludingVatCurrency=${ol.amountExcludingVatCurrency}, amountIncludingVatCurrency=${ol.amountIncludingVatCurrency}, account=${ol.account?.number}`);
      }
    }
    console.log(`  voucher postings: ${d.voucher?.postings?.length ?? 0}`);
    if (d.voucher?.postings) {
      for (const p of d.voucher.postings) {
        console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}`);
      }
    }

    // Now try to set postings and book the direct SI's voucher
    if (d.voucher?.id) {
      const directVoucherId = d.voucher.id;
      const directVoucherVersion = d.voucher.version;
      console.log(`\n  Setting postings on direct SI voucher ${directVoucherId} v${directVoucherVersion}`);

      const directPutRes = await api("PUT", `/ledger/voucher/${directVoucherId}?sendToLedger=false`, {
        version: directVoucherVersion,
        postings: [
          {
            row: 1,
            account: { id: expenseAccountId },
            description,
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
            description,
            amount: -gross,
            amountCurrency: -gross,
            amountGross: -gross,
            amountGrossCurrency: -gross,
            invoiceNumber: directInvNumber,
            termOfPayment: dueDate,
          },
        ],
      });
      console.log(`  Postings set, version=${directPutRes.value.version}`);

      const directBookRes = await api("PUT", `/ledger/voucher/${directVoucherId}?sendToLedger=true`, {
        version: directPutRes.value.version,
      });
      console.log(`  Booked, number=${directBookRes.value.number}`);

      // Re-fetch the SI to see final state
      const finalDsi = await api("GET", `/supplierInvoice/${dsi.id}?fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);
      const fd = finalDsi.value;
      console.log(`\n  --- Direct SI after booking ---`);
      console.log(`  amount: ${fd.amount}`);
      console.log(`  amountCurrency: ${fd.amountCurrency}`);
      console.log(`  voucher.number: ${fd.voucher?.number}`);
      console.log(`  orderLines: ${fd.orderLines?.length ?? 0}`);
      console.log(`  voucher postings: ${fd.voucher?.postings?.length ?? 0}`);
      if (fd.voucher?.postings) {
        for (const p of fd.voucher.postings) {
          console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}`);
        }
      }
    }
  } catch (e) {
    console.error("Direct POST /supplierInvoice failed:", e);
  }

  // === PHASE 3: Try POST /supplierInvoice with account on orderLines ===
  console.log("\n\n=== PHASE 3: POST /supplierInvoice with account on orderLines ===\n");

  const directInvNumber3 = `INV-DIRECT3-${uid}`;

  try {
    const directRes3 = await api("POST", "/supplierInvoice", {
      invoiceNumber: directInvNumber3,
      invoiceDate: date,
      invoiceDueDate: dueDate,
      supplier: { id: supplierId },
      currency: { id: 1 },
      voucher: {
        date: date,
        description: `Direct invoice ${directInvNumber3}`,
      },
      orderLines: [
        {
          description: description,
          count: 1,
          unitCostCurrency: net,
          vatType: { id: 1 },
          account: { id: expenseAccountId },
          amountExcludingVatCurrency: net,
          amountIncludingVatCurrency: gross,
        },
      ],
    });

    const d3 = directRes3.value;
    console.log(`  Direct SI3 created, id=${d3.id}`);
    console.log(`  invoiceNumber: ${d3.invoiceNumber}`);
    console.log(`  amount: ${d3.amount}`);
    console.log(`  amountCurrency: ${d3.amountCurrency}`);

    // Get full details
    const d3Detail = await api("GET", `/supplierInvoice/${d3.id}?fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);
    const d3d = d3Detail.value;
    console.log(`  voucher.id: ${d3d.voucher?.id}`);
    console.log(`  voucher.number: ${d3d.voucher?.number}`);
    console.log(`  orderLines: ${d3d.orderLines?.length ?? 0}`);
    if (d3d.orderLines?.length > 0) {
      for (const ol of d3d.orderLines) {
        console.log(`    orderLine: description=${ol.description}, unitCostCurrency=${ol.unitCostCurrency}, amountExcludingVatCurrency=${ol.amountExcludingVatCurrency}, amountIncludingVatCurrency=${ol.amountIncludingVatCurrency}, account=${ol.account?.number}`);
      }
    }
    console.log(`  voucher postings: ${d3d.voucher?.postings?.length ?? 0}`);
    if (d3d.voucher?.postings) {
      for (const p of d3d.voucher.postings) {
        console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}, supplier=${p.supplier?.id}`);
      }
    }

    // Try booking directly via sendToLedger=true on voucher
    if (d3d.voucher?.id) {
      try {
        const bookDirect3 = await api("PUT", `/ledger/voucher/${d3d.voucher.id}?sendToLedger=true`, {
          version: d3d.voucher.version,
        });
        console.log(`  Booked direct3, number=${bookDirect3.value.number}`);

        // Re-fetch
        const finalD3 = await api("GET", `/supplierInvoice/${d3.id}?fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);
        const fd3 = finalD3.value;
        console.log(`\n  --- Direct SI3 after booking ---`);
        console.log(`  amount: ${fd3.amount}`);
        console.log(`  amountCurrency: ${fd3.amountCurrency}`);
        console.log(`  voucher.number: ${fd3.voucher?.number}`);
        console.log(`  orderLines: ${fd3.orderLines?.length ?? 0}`);
        console.log(`  voucher postings: ${fd3.voucher?.postings?.length ?? 0}`);
        if (fd3.voucher?.postings) {
          for (const p of fd3.voucher.postings) {
            console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}`);
          }
        }
      } catch (e) {
        console.error("  Booking direct3 failed:", e);
      }
    }
  } catch (e) {
    console.error("Direct POST /supplierInvoice (3) failed:", e);
  }

  console.log("\n\n=== INVESTIGATION COMPLETE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
