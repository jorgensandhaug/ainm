const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "81GEzq91eyvZ3z8FAWXOLw0rtF6_BmRmu27KvHbb9H4";

const runDate = "2026-03-20";
const supplierName = "Stormberg AS";
const organizationNumber = "877462137";
const invoiceNumber = "INV-2026-9382";
const description = "kontortjenester";
const expenseAccountNumber = "6340";
const vatPercentage = 25;
const grossAmount = 61600;
const netAmount = Math.round((grossAmount * 100) / (100 + vatPercentage));
const vatAmount = grossAmount - netAmount;

type IdRef = { id?: number | null };
type ListResponse<T> = { values?: T[]; fullResultSize?: number };
type ValueResponse<T> = { value?: T };

type Supplier = {
  id?: number;
  name?: string;
  organizationNumber?: string;
  isInactive?: boolean;
  ledgerAccount?: IdRef | null;
};

type Account = {
  id?: number;
  number?: number | string;
};

type VatType = {
  id?: number;
  number?: string;
  percentage?: number;
};

type VoucherPosting = {
  row?: number;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
  supplier?: IdRef | null;
  account?: IdRef | null;
  vatType?: IdRef | null;
};

type Voucher = {
  id?: number;
  version?: number;
  postings?: VoucherPosting[];
};

function makeUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
}

async function requestJson<T>(
  method: string,
  path: string,
  opts: { params?: Record<string, string>; body?: unknown; isForm?: boolean } = {},
): Promise<T> {
  const response = await fetch(makeUrl(path, opts.params), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(opts.body && !opts.isForm ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.isForm ? (opts.body as FormData) : opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    if (
      response.status === 403 &&
      (
        data?.error === "Invalid or expired token" ||
        data?.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
      )
    ) {
      throw new Error(`Blocked by unusable credentials: ${JSON.stringify(data)}`);
    }
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data ?? text)}`);
  }

  return data as T;
}

function exactOne<T>(values: T[], label: string): T {
  if (values.length !== 1) {
    throw new Error(`Expected exactly one ${label}, got ${values.length}`);
  }
  return values[0]!;
}

function requireId(value: number | undefined | null, label: string): number {
  if (!value) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function money(value: number): string {
  return value.toFixed(2);
}

function chooseVatType(vatTypes: VatType[]): VatType {
  const matches = vatTypes.filter((vatType) => Number(vatType.percentage ?? NaN) === vatPercentage);
  if (matches.length === 0) {
    throw new Error(`No incoming VAT type found for ${vatPercentage}%`);
  }
  return (
    matches.find((vatType) => String(vatType.number ?? "") === "1") ??
    matches.find((vatType) => /^\d+$/.test(String(vatType.number ?? ""))) ??
    matches[0]!
  );
}

function buildInvoiceXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${runDate}</cbc:IssueDate>
  <cbc:DueDate>${runDate}</cbc:DueDate>
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
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0192">999999999</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>Debug Buyer AS</cbc:Name>
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
        <cbc:RegistrationName>Debug Buyer AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
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

async function resolveSupplier(): Promise<{ supplierId: number; supplierLedgerAccountId: number }> {
  const search = await requestJson<ListResponse<Supplier>>("GET", "supplier", {
    params: {
      organizationNumber,
      fields: "*",
    },
  });
  const suppliers = search.values ?? [];

  if (suppliers.length === 1) {
    const supplier = suppliers[0]!;
    return {
      supplierId: requireId(supplier.id, "supplier.id"),
      supplierLedgerAccountId: requireId(supplier.ledgerAccount?.id, "supplier.ledgerAccount.id"),
    };
  }

  if (suppliers.length > 1) {
    const exactMatches = suppliers.filter(
      (supplier) =>
        supplier.organizationNumber === organizationNumber &&
        supplier.name === supplierName &&
        supplier.isInactive !== true,
    );
    const supplier = exactOne(exactMatches, "exact supplier match");
    return {
      supplierId: requireId(supplier.id, "supplier.id"),
      supplierLedgerAccountId: requireId(supplier.ledgerAccount?.id, "supplier.ledgerAccount.id"),
    };
  }

  const created = await requestJson<ValueResponse<Supplier>>("POST", "supplier", {
    body: {
      name: supplierName,
      organizationNumber,
    },
  });
  const supplier = created.value;
  return {
    supplierId: requireId(supplier?.id, "created supplier.id"),
    supplierLedgerAccountId: requireId(supplier?.ledgerAccount?.id, "created supplier.ledgerAccount.id"),
  };
}

async function main() {
  const { supplierId, supplierLedgerAccountId } = await resolveSupplier();

  const accountList = await requestJson<ListResponse<Account>>("GET", "ledger/account", {
    params: {
      number: expenseAccountNumber,
      isApplicableForSupplierInvoice: "true",
      fields: "*",
    },
  });
  const expenseAccount = exactOne(
    (accountList.values ?? []).filter((account) => String(account.number ?? "") === expenseAccountNumber),
    `expense account ${expenseAccountNumber}`,
  );
  const expenseAccountId = requireId(expenseAccount.id, "expenseAccount.id");

  const vatTypeList = await requestJson<ListResponse<VatType>>("GET", "ledger/vatType", {
    params: {
      typeOfVat: "INCOMING",
      vatDate: runDate,
      fields: "*",
    },
  });
  const vatType = chooseVatType(vatTypeList.values ?? []);
  const vatTypeId = requireId(vatType.id, "vatType.id");

  const form = new FormData();
  form.append("description", `import-${invoiceNumber}`);
  form.append(
    "file",
    new Blob([buildInvoiceXml()], { type: "application/xml" }),
    `${invoiceNumber}.xml`,
  );

  const imported = await requestJson<ListResponse<Voucher>>("POST", "ledger/voucher/importDocument", {
    body: form,
    isForm: true,
  });
  const importedVoucher = exactOne(imported.values ?? [], "imported voucher");
  const voucherId = requireId(importedVoucher.id, "importedVoucher.id");

  const updated = await requestJson<ValueResponse<Voucher>>("PUT", `ledger/voucher/${voucherId}`, {
    params: { sendToLedger: "false" },
    body: {
      version: importedVoucher.version,
      postings: [
        {
          row: 1,
          date: runDate,
          description,
          account: { id: expenseAccountId },
          vatType: { id: vatTypeId },
          amount: netAmount,
          amountCurrency: netAmount,
          amountGross: grossAmount,
          amountGrossCurrency: grossAmount,
        },
        {
          row: 2,
          date: runDate,
          description,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          amount: -grossAmount,
          amountCurrency: -grossAmount,
          amountGross: -grossAmount,
          amountGrossCurrency: -grossAmount,
          invoiceNumber,
          termOfPayment: runDate,
        },
      ],
    },
  });

  const voucher = updated.value;
  const postings = voucher?.postings ?? [];
  const expensePosting = postings.find(
    (posting) =>
      posting.account?.id === expenseAccountId &&
      posting.vatType?.id === vatTypeId &&
      posting.amount === netAmount &&
      posting.amountGross === grossAmount,
  );
  const supplierPosting = postings.find(
    (posting) =>
      posting.account?.id === supplierLedgerAccountId &&
      posting.supplier?.id === supplierId &&
      posting.amount === -grossAmount &&
      posting.amountGross === -grossAmount &&
      posting.invoiceNumber === invoiceNumber &&
      posting.termOfPayment === runDate,
  );
  const vatPosting = postings.find(
    (posting) =>
      posting.row !== 1 &&
      posting.row !== 2 &&
      posting.amount === vatAmount,
  );

  if (!voucher?.id || !expensePosting || !supplierPosting || !vatPosting) {
    throw new Error(`Final voucher state not proven by write response: ${JSON.stringify(updated)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        voucherId: voucher.id,
        supplierId,
        expenseAccountId,
        vatTypeId,
      },
      null,
      2,
    ),
  );
}

await main();
