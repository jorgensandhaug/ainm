const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vkcS9mR-7LC4_BZoCx9-v5Tcw5c1XNUztULw3ZfDg6k";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const hdrs: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method };
  if (body instanceof FormData) {
    opts.headers = { Authorization: AUTH };
    opts.body = body;
  } else {
    opts.headers = hdrs;
    if (body !== undefined) opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} → ${res.status}`);
  }
  return json;
}

const INV = "INV-2026-4194";
const SUPPLIER = "Viento SL";
const ORG = "933672905";
const GROSS = 19350;
const NET = GROSS / 1.25;   // 15480
const VAT = GROSS - NET;    // 3870
const ACCT = 6540;
const DESC = "servicios de oficina";
const DATE = "2026-03-22";
const DUE = "2026-04-21";

async function main() {
  // 1. Create supplier
  const s = await api("POST", "/supplier", {
    name: SUPPLIER,
    organizationNumber: ORG,
    supplierNumber: 0,
  });
  const suppId = s.value.id;
  const suppAcctId = s.value.ledgerAccount?.id;
  console.log("supplier id:", suppId, "ledgerAccount.id:", suppAcctId);

  // 2. GET expense account id
  const a = await api("GET", `/ledger/account?number=${ACCT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expAcctId = a.values[0]?.id;
  if (!expAcctId) throw new Error("account not found");
  console.log("expense account id:", expAcctId);

  // If supplier response didn't include ledgerAccount, fall back to GET 2400
  let liabAcctId = suppAcctId;
  if (!liabAcctId) {
    console.log("ledgerAccount not in supplier response, fetching 2400...");
    const la = await api("GET", "/ledger/account?number=2400&fields=*");
    liabAcctId = la.values[0]?.id;
    if (!liabAcctId) throw new Error("account 2400 not found");
  }
  console.log("liability account id:", liabAcctId);

  // 3. importDocument with EHF XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Ukjent</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER}</cbc:RegistrationName></cac:PartyLegalEntity>
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
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
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
      <cbc:Name>${DESC}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "application/xml" }), `${INV}.xml`);
  const imp = await api("POST", "/ledger/voucher/importDocument", fd);
  console.log("importDocument response:", JSON.stringify(imp, null, 2));
  const vid = imp.value?.id ?? imp.values?.[0]?.id ?? imp.id;
  const v1 = imp.value?.version ?? imp.values?.[0]?.version ?? imp.version;
  if (!vid) throw new Error("no voucher id in response");
  console.log("voucher id:", vid, "version:", v1);

  // 4. PUT postings
  const p = await api("PUT", `/ledger/voucher/${vid}?sendToLedger=false`, {
    version: v1,
    postings: [
      {
        row: 1, date: DATE, description: DESC,
        account: { id: expAcctId }, vatType: { id: 1 },
        amount: NET, amountCurrency: NET,
        amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date: DATE, description: DESC,
        account: { id: liabAcctId }, supplier: { id: suppId },
        amount: -GROSS, amountCurrency: -GROSS,
        amountGross: -GROSS, amountGrossCurrency: -GROSS,
        invoiceNumber: INV, termOfPayment: DUE,
      },
    ],
  });
  const v2 = p.value.version;
  console.log("postings set, version:", v2);

  // 5. PUT book
  const b = await api("PUT", `/ledger/voucher/${vid}?sendToLedger=true`, {
    version: v2,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log("BOOKED. number:", b.value.number, "id:", b.value.id);
}

main().catch(e => { console.error(e); process.exit(1); });
