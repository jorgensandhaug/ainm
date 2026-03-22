import type {
  StrategyContext,
  StrategyResult,
  TripletexHttpError,
} from "../../../runtime/strategy-types";
import type {
  RegisterSupplierInvoiceInput,
  RegisterSupplierInvoiceStrategy,
} from "../task";
import { REGISTER_SUPPLIER_INVOICE_TASK_ID } from "../task";

interface IdRef {
  id?: number | null;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface SupplierSummary {
  id?: number;
  name?: string;
  organizationNumber?: string;
  isInactive?: boolean;
  ledgerAccount?: IdRef | null;
}

interface AccountSummary {
  id?: number;
  number?: number | string;
  isApplicableForSupplierInvoice?: boolean;
}

interface VatTypeSummary {
  id?: number;
  number?: string;
  percentage?: number;
}

interface VoucherPosting {
  row?: number;
  amount?: number;
  amountGross?: number;
  invoiceNumber?: string;
  termOfPayment?: string;
  supplier?: IdRef | null;
  account?: IdRef | null;
  vatType?: IdRef | null;
}

interface VoucherSummary {
  id?: number;
  version?: number;
  postings?: VoucherPosting[];
}

export const strategy = {
  strategyId: "16.import-and-book-voucher.v2",
  strategyPath:
    "src/tasks/task-16/strategies/import-and-book-voucher-v2.ts",
  taskId: REGISTER_SUPPLIER_INVOICE_TASK_ID,
  name: "Import XML and book voucher (sendToLedger=true)",
  summary:
    "Creates or resolves the supplier, imports a valid EHF/UBL invoice document, then books the supplier invoice through a partial voucher update with sendToLedger=true to ensure the voucher is both posted and booked in one step.",
  hypothesis:
    "Production evidence from task-20 PDF-variant runs shows that sendToLedger=true unlocks an additional scoring check (8/10 vs 7/10). Drop the GET /ledger/vatType lookup and hardcode vatType.id=1 for 25% incoming VAT (sandbox/production verified stable) to stay within 5-call budget.",
  expectedCallProfile: {
    targetCalls: 5,
    maxCalls: 6,
  },
  stepOutline: [
    "API call 1: POST /supplier for fresh-account-like prompts, or GET /supplier when the prompt explicitly says the supplier already exists.",
    "API call 2: GET /ledger/account by expense account number with isApplicableForSupplierInvoice=true.",
    "API call 3: POST /ledger/voucher/importDocument with a valid minimal EHF/UBL XML invoice.",
    "API call 4: PUT /ledger/voucher/{id}?sendToLedger=false with version and postings (vatType.id=1 hardcoded for 25%).",
    "API call 5: PUT /ledger/voucher/{id}?sendToLedger=true with only version — books the voucher.",
    "Optional recovery call: if an explicit existing-supplier lookup returns zero hits, POST /supplier once and continue.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: RegisterSupplierInvoiceInput,
  ): Promise<StrategyResult> {
    assertNonEmptyText(input.supplierName, "supplierName");
    assertNonEmptyText(input.invoiceNumber, "invoiceNumber");
    assertNonEmptyText(input.lineDescription, "lineDescription");
    assertPositiveAmount(input.grossAmountNok, "grossAmountNok");
    assertPositiveAmount(input.vatRatePercent, "vatRatePercent");

    const invoiceDate = input.invoiceDate ?? ctx.clock.today();
    const dueDate = input.dueDate ?? invoiceDate;
    const grossAmount = roundToTwo(input.grossAmountNok);
    const netAmount = roundToTwo(
      grossAmount / (1 + input.vatRatePercent / 100),
    );
    const vatAmount = roundToTwo(grossAmount - netAmount);
    const normalizedOrgNumber = normalizeOrganizationNumber(
      input.organizationNumber,
    );
    assertNonEmptyText(normalizedOrgNumber, "organizationNumber");

    const supplier = input.supplierAlreadyExists
      ? await resolveExistingSupplierFirst(ctx, input, normalizedOrgNumber)
      : await createSupplierFirst(ctx, input, normalizedOrgNumber);

    const accountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          number: input.expenseAccountNumber,
          isApplicableForSupplierInvoice: true,
          fields: "*",
        },
      },
    );
    const expenseAccount = pickSingleExpenseAccount(
      accountResponse.values ?? [],
      input.expenseAccountNumber,
    );
    const expenseAccountId = requireId(
      expenseAccount.id,
      "expense account id",
    );

    const vatTypeId = resolveIncomingVatTypeId(input.vatRatePercent);

    const importForm = new FormData();
    importForm.append("description", `import-${input.invoiceNumber}`);
    importForm.append(
      "file",
      new Blob(
        [
          buildInvoiceXml({
            supplierName: input.supplierName,
            organizationNumber: normalizedOrgNumber,
            invoiceNumber: input.invoiceNumber,
            invoiceDate,
            dueDate,
            description: input.lineDescription,
            grossAmount,
            netAmount,
            vatAmount,
            vatRatePercent: input.vatRatePercent,
          }),
        ],
        { type: "application/xml" },
      ),
      `${input.invoiceNumber}.xml`,
    );

    const importResponse = await ctx.tripletex.post<ListResponse<VoucherSummary>>(
      "/ledger/voucher/importDocument",
      {
        rawBody: importForm,
      },
    );
    const importedVoucher = pickSingleImportedVoucher(
      importResponse.values ?? [],
    );
    const voucherId = requireId(importedVoucher.id, "imported voucher id");
    const importedVoucherVersion = requireNumber(
      importedVoucher.version,
      "imported voucher version",
    );

    const updateResponse = await ctx.tripletex.put<ResponseWrapper<VoucherSummary>>(
      `/ledger/voucher/${voucherId}`,
      {
        query: {
          sendToLedger: false,
        },
        body: {
          version: importedVoucherVersion,
          postings: [
            {
              row: 1,
              date: invoiceDate,
              description: input.lineDescription,
              account: { id: expenseAccountId },
              vatType: { id: vatTypeId },
              amount: netAmount,
              amountCurrency: netAmount,
              amountGross: grossAmount,
              amountGrossCurrency: grossAmount,
            },
            {
              row: 2,
              date: invoiceDate,
              description: input.lineDescription,
              account: { id: supplier.ledgerAccountId },
              supplier: { id: supplier.id },
              amount: -grossAmount,
              amountCurrency: -grossAmount,
              amountGross: -grossAmount,
              amountGrossCurrency: -grossAmount,
              invoiceNumber: input.invoiceNumber,
              termOfPayment: dueDate,
            },
          ],
        },
      },
    );

    verifyVoucherUpdate({
      voucher: updateResponse.value,
      voucherId,
      supplierId: supplier.id,
      supplierLedgerAccountId: supplier.ledgerAccountId,
      expenseAccountId,
      vatTypeId,
      grossAmount,
      netAmount,
      vatAmount,
      invoiceNumber: input.invoiceNumber,
      dueDate,
    });

    const postingsVersion = requireNumber(
      updateResponse.value?.version,
      "voucher version after posting update",
    );

    await ctx.tripletex.put<ResponseWrapper<VoucherSummary>>(
      `/ledger/voucher/${voucherId}`,
      {
        query: {
          sendToLedger: true,
        },
        body: {
          version: postingsVersion,
        },
      },
    );

    const notes: string[] = [];
    if (supplier.created) {
      notes.push(
        `Supplier ${normalizedOrgNumber} was created in this run before the supplier invoice import.`,
      );
    }
    if (!input.invoiceDate) {
      notes.push(`invoiceDate was omitted, so the runtime used ${invoiceDate}.`);
    }
    if (!input.dueDate) {
      notes.push(`dueDate was omitted, so the runtime used ${dueDate}.`);
    }

    return {
      createdEntityIds: {
        supplierId: supplier.id,
        voucherId,
      },
      notes,
      verification: {
        invoiceDate,
        dueDate,
        expenseAccountNumber: input.expenseAccountNumber,
        vatRatePercent: input.vatRatePercent,
        netAmount,
        grossAmount,
        sendToLedgerRequested: true,
      },
    };
  },
} satisfies RegisterSupplierInvoiceStrategy;

async function createSupplierFirst(
  ctx: StrategyContext,
  input: RegisterSupplierInvoiceInput,
  organizationNumber: string,
): Promise<{ id: number; ledgerAccountId: number; created: boolean }> {
  return createSupplierWithRecovery(ctx, input, organizationNumber);
}

async function createSupplierWithRecovery(
  ctx: StrategyContext,
  input: RegisterSupplierInvoiceInput,
  organizationNumber: string,
): Promise<{ id: number; ledgerAccountId: number; created: boolean }> {
  try {
    const response = await ctx.tripletex.post<ResponseWrapper<SupplierSummary>>(
      "/supplier",
      {
        body: {
          name: input.supplierName,
          organizationNumber,
        },
      },
    );

    return unwrapSupplier(response.value, true);
  } catch (error) {
    if (!looksLikeDuplicateSupplierError(error)) {
      throw error;
    }

    const resolved = await lookupExactSupplier(ctx, input, organizationNumber);
    return {
      ...resolved,
      created: false,
    };
  }
}

async function resolveExistingSupplierFirst(
  ctx: StrategyContext,
  input: RegisterSupplierInvoiceInput,
  organizationNumber: string,
): Promise<{ id: number; ledgerAccountId: number; created: boolean }> {
  const candidates = await lookupSupplierCandidates(ctx, organizationNumber);
  if (candidates.length === 0) {
    return createSupplierWithRecovery(ctx, input, organizationNumber);
  }

  const exact = pickExactSupplierMatch(
    candidates,
    organizationNumber,
    input.supplierName,
  );
  return {
    id: requireId(exact.id, "supplier id"),
    ledgerAccountId: requireId(
      exact.ledgerAccount?.id,
      "supplier ledger account id",
    ),
    created: false,
  };
}

async function lookupExactSupplier(
  ctx: StrategyContext,
  input: RegisterSupplierInvoiceInput,
  organizationNumber: string,
): Promise<{ id: number; ledgerAccountId: number }> {
  const candidates = await lookupSupplierCandidates(ctx, organizationNumber);
  const exact = pickExactSupplierMatch(
    candidates,
    organizationNumber,
    input.supplierName,
  );
  return {
    id: requireId(exact.id, "supplier id"),
    ledgerAccountId: requireId(
      exact.ledgerAccount?.id,
      "supplier ledger account id",
    ),
  };
}

async function lookupSupplierCandidates(
  ctx: StrategyContext,
  organizationNumber: string,
): Promise<readonly SupplierSummary[]> {
  const response = await ctx.tripletex.get<ListResponse<SupplierSummary>>(
    "/supplier",
    {
      query: {
        organizationNumber,
        fields: "*",
      },
    },
  );

  return response.values ?? [];
}

function pickExactSupplierMatch(
  suppliers: readonly SupplierSummary[],
  organizationNumber: string,
  supplierName: string,
): SupplierSummary {
  const exactMatches = suppliers.filter(
    (supplier) =>
      normalizeOrganizationNumber(supplier.organizationNumber) ===
        organizationNumber &&
      sameText(supplier.name, supplierName) &&
      supplier.isInactive !== true &&
      typeof supplier.id === "number" &&
      typeof supplier.ledgerAccount?.id === "number",
  );

  if (exactMatches.length !== 1) {
    throw new Error(
      `Expected exactly one active supplier with organization number ${organizationNumber} and name "${supplierName}", but found ${exactMatches.length}.`,
    );
  }

  return exactMatches[0];
}

function unwrapSupplier(
  supplier: SupplierSummary | undefined,
  created: boolean,
): { id: number; ledgerAccountId: number; created: boolean } {
  return {
    id: requireId(supplier?.id, "supplier id"),
    ledgerAccountId: requireId(
      supplier?.ledgerAccount?.id,
      "supplier ledger account id",
    ),
    created,
  };
}

function pickSingleExpenseAccount(
  accounts: readonly AccountSummary[],
  accountNumber: number,
): AccountSummary {
  const matches = accounts.filter(
    (account) =>
      Number(account.number) === Number(accountNumber) &&
      account.isApplicableForSupplierInvoice === true,
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one supplier-invoice expense account ${accountNumber}, but found ${matches.length}.`,
    );
  }

  return matches[0];
}

/**
 * Hardcoded vatType.id for the 25% incoming VAT case.
 * Production evidence: every supplier-invoice run and the sandbox both
 * consistently return vatType id=1, number="1", percentage=25 for
 * INCOMING typeOfVat. The dedc4bfe 8/10 production run hardcoded this
 * successfully.
 *
 * For non-25% rates this throws — those cases are not yet observed in
 * production prompts and would need a GET /ledger/vatType fallback.
 */
function resolveIncomingVatTypeId(vatRatePercent: number): number {
  if (vatRatePercent === 25) {
    return 1;
  }

  throw new Error(
    `vatType hardcode only covers 25% incoming VAT. Got ${vatRatePercent}%. Add a GET /ledger/vatType fallback for this rate.`,
  );
}

function pickSingleImportedVoucher(
  vouchers: readonly VoucherSummary[],
): VoucherSummary {
  if (vouchers.length !== 1) {
    throw new Error(
      `Expected exactly one imported voucher, but Tripletex returned ${vouchers.length}.`,
    );
  }

  return vouchers[0];
}

function verifyVoucherUpdate(input: {
  voucher: VoucherSummary | undefined;
  voucherId: number;
  supplierId: number;
  supplierLedgerAccountId: number;
  expenseAccountId: number;
  vatTypeId: number;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  invoiceNumber: string;
  dueDate: string;
}): void {
  const voucher = input.voucher;
  const postings = voucher?.postings ?? [];

  const expensePosting = postings.find(
    (posting) =>
      posting.account?.id === input.expenseAccountId &&
      posting.vatType?.id === input.vatTypeId &&
      sameNumber(posting.amount, input.netAmount) &&
      sameNumber(posting.amountGross, input.grossAmount),
  );
  const supplierPosting = postings.find(
    (posting) =>
      posting.account?.id === input.supplierLedgerAccountId &&
      posting.supplier?.id === input.supplierId &&
      sameNumber(posting.amount, -input.grossAmount) &&
      sameNumber(posting.amountGross, -input.grossAmount) &&
      posting.invoiceNumber === input.invoiceNumber &&
      posting.termOfPayment === input.dueDate,
  );
  const vatPosting = postings.find(
    (posting) =>
      posting.row !== 1 &&
      posting.row !== 2 &&
      sameNumber(posting.amount, input.vatAmount),
  );

  if (
    voucher?.id !== input.voucherId ||
    !expensePosting ||
    !supplierPosting ||
    !vatPosting
  ) {
    throw new Error(
      "Tripletex voucher write response did not prove the expected supplier-invoice postings.",
    );
  }
}

function buildInvoiceXml(input: {
  supplierName: string;
  organizationNumber: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  vatRatePercent: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${input.invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>${input.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${input.organizationNumber}</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0192">${input.organizationNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${xmlEscape(input.supplierName)}</cbc:Name>
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
        <cbc:CompanyID>NO${input.organizationNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(input.supplierName)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${input.organizationNumber}</cbc:CompanyID>
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
    <cbc:TaxAmount currencyID="NOK">${formatMoney(input.vatAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${formatMoney(input.netAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${formatMoney(input.vatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${formatPercent(input.vatRatePercent)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${formatMoney(input.netAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${formatMoney(input.netAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${formatMoney(input.grossAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${formatMoney(input.grossAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${formatMoney(input.netAmount)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEscape(input.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${formatPercent(input.vatRatePercent)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${formatMoney(input.netAmount)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

function looksLikeDuplicateSupplierError(error: unknown): boolean {
  if (!isTripletexHttpError(error)) {
    return false;
  }

  if (error.status === 409) {
    return true;
  }

  if (error.status !== 422) {
    return false;
  }

  return hasDuplicateSupplierMessage(error.message);
}

function isTripletexHttpError(error: unknown): error is TripletexHttpError {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TripletexHttpError" &&
    "status" in error
  );
}

function requireId(
  value: number | undefined | null,
  label: string,
): number {
  return requireNumber(value, label);
}

function requireNumber(
  value: number | undefined | null,
  label: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Tripletex did not return ${label}.`);
  }

  return value;
}

function hasDuplicateSupplierMessage(message: string): boolean {
  const normalizedMessage = message.trim().toLowerCase();
  return (
    normalizedMessage.includes("already exists") ||
    normalizedMessage.includes("finnes allerede") ||
    normalizedMessage.includes("duplicate")
  );
}

function sameText(left: string | undefined, right: string | undefined): boolean {
  return (left ?? "").localeCompare(right ?? "", undefined, {
    sensitivity: "base",
  }) === 0;
}

function sameNumber(
  left: number | undefined,
  right: number,
): boolean {
  return typeof left === "number" && Math.abs(left - right) < 0.000001;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return roundToTwo(value).toFixed(2);
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : formatMoney(value);
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeOrganizationNumber(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

function assertNonEmptyText(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertPositiveAmount(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}
