import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type {
  CreateCustomerInvoiceInput,
  CreateCustomerInvoiceLineInput,
  CreateCustomerInvoiceStrategy,
} from "../task";
import { CREATE_CUSTOMER_INVOICE_TASK_ID } from "../task";

interface CustomerSummary {
  id: number;
  name?: string;
  organizationNumber?: string;
}

interface ProductSummary {
  id: number;
  name?: string;
  number?: string;
  productNumber?: string;
  vatType?: VatTypeSummary | null;
}

interface VatTypeSummary {
  id: number;
  percentage?: number;
}

interface LedgerAccountSummary {
  id: number;
  version?: number;
  number?: number | string;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
}

interface InvoiceSummary {
  id: number;
  invoiceNumber?: number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  amountOutstanding?: number;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

export const strategy = {
  strategyId: "09.create-customer-invoice.v1",
  strategyPath: "src/tasks/task-09/strategies/create-customer-invoice.ts",
  taskId: CREATE_CUSTOMER_INVOICE_TASK_ID,
  name: "Create customer invoice",
  summary:
    "Resolves the existing customer, resolves referenced products with a direct product-number branch plus catalog fallback, prefers reusable product VAT ids before any outgoing VAT lookup, creates the invoice without sending it, and repairs the company bank account only if that validation branch is triggered.",
  hypothesis:
    "The best create-only flow is customer lookup, product resolution, then POST /invoice?sendToCustomer=false when the resolved products already expose reusable VAT ids, with /ledger/vatType reserved for lines that still need an explicit outgoing VAT mapping and bank-account repair held behind the known invoice validation failure.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 7,
  },
  stepOutline: [
    "API call 1: GET /customer by organization number to resolve the existing customer ID.",
    "API call 2: resolve products either via direct productNumber query or, if incomplete, a single product catalog read.",
    "API call 3: when the resolved products do not already provide reusable VAT ids for the line payload, GET /ledger/vatType for the invoice date to map the requested VAT percentages.",
    "Final write: POST /invoice?sendToCustomer=false with orderLines under orders[].",
    "Conditional repair: if invoice creation fails with the known company bank account validation, GET /ledger/account, PUT the chosen bank account, and retry the same invoice write once.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: CreateCustomerInvoiceInput,
  ): Promise<StrategyResult> {
    assertInvoiceLines(input.lines);

    const invoiceDate = input.invoiceDate ?? ctx.clock.today();
    const invoiceDueDate = input.invoiceDueDate ?? addDays(invoiceDate, 14);
    const normalizedOrgNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );

    const customerResponse = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
      "/customer",
      {
        query: {
          organizationNumber: normalizedOrgNumber,
          count: 10,
          fields: "*",
        },
      },
    );
    const customer = pickCustomer(
      customerResponse.values ?? [],
      normalizedOrgNumber,
      input.customerName,
    );

    const resolvedProducts = await resolveProducts(ctx, input.lines);
    const vatTypes = await resolveVatTypesIfNeeded(
      ctx,
      invoiceDate,
      input.lines,
      resolvedProducts,
    );
    const invoicePayload = buildInvoicePayload(
      customer.id,
      invoiceDate,
      invoiceDueDate,
      input.lines,
      resolvedProducts,
      vatTypes,
    );

    let repairedBankAccount = false;
    let invoiceResponse: ResponseWrapper<InvoiceSummary>;

    try {
      invoiceResponse = await createInvoice(ctx, invoicePayload);
    } catch (error) {
      if (!needsBankAccountRepair(error)) {
        throw error;
      }

      repairedBankAccount = true;
      await repairMissingCompanyBankAccount(ctx);
      invoiceResponse = await createInvoice(ctx, invoicePayload);
    }

    const invoice = requireValue(invoiceResponse.value, "invoice");
    const notes: string[] = [];

    if (
      input.customerName &&
      customer.name?.trim() &&
      !sameText(customer.name.trim(), input.customerName.trim())
    ) {
      notes.push(
        `Customer lookup matched organization number ${normalizedOrgNumber}, but the stored name "${customer.name.trim()}" differed from extracted input "${input.customerName.trim()}".`,
      );
    }

    if (repairedBankAccount) {
      notes.push(
        "Tripletex required a company bank account before invoice creation, so the strategy repaired the existing invoice account and retried the same invoice payload once.",
      );
    }

    return {
      createdEntityIds: {
        customerId: customer.id,
        invoiceId: requireId(invoice.id, "invoice"),
      },
      notes,
      verification: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate,
        invoiceDueDate,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency,
        amountOutstanding: invoice.amountOutstanding,
        sendToCustomerRequested: false,
      },
    };
  },
} satisfies CreateCustomerInvoiceStrategy;

async function resolveProducts(
  ctx: StrategyContext,
  lines: readonly CreateCustomerInvoiceLineInput[],
): Promise<Map<number, ProductSummary>> {
  const indexedLines = lines.map((line, index) => ({ line, index }));
  const allLinesHaveProductNumbers = indexedLines.every(
    ({ line }) => normalizeProductRef(line.productNumber) !== undefined,
  );
  const hasAnyProductHints = indexedLines.some(
    ({ line }) =>
      normalizeProductRef(line.productNumber) !== undefined ||
      normalizeProductName(line.productName) !== undefined,
  );

  if (!hasAnyProductHints) {
    return new Map<number, ProductSummary>();
  }

  if (allLinesHaveProductNumbers) {
    const directPath = buildDirectProductLookupPath(indexedLines);
    const directResponse = await ctx.tripletex.get<ListResponse<ProductSummary>>(
      directPath,
    );
    const directMatches = matchProducts(
      indexedLines,
      directResponse.values ?? [],
    );
    if (directMatches.size === indexedLines.length) {
      return directMatches;
    }
  }

  const catalogResponse = await ctx.tripletex.get<ListResponse<ProductSummary>>(
    "/product",
    {
      query: {
        count: 1000,
        fields: "*",
      },
    },
  );
  const catalogMatches = matchProducts(indexedLines, catalogResponse.values ?? []);
  if (catalogMatches.size !== indexedLines.length) {
    throw new Error(
      "Could not resolve all referenced products from the provided product numbers or names.",
    );
  }

  return catalogMatches;
}

async function resolveVatTypesIfNeeded(
  ctx: StrategyContext,
  invoiceDate: string,
  lines: readonly CreateCustomerInvoiceLineInput[],
  products: ReadonlyMap<number, ProductSummary>,
): Promise<Map<number, VatTypeSummary>> {
  if (!needsExplicitVatLookup(lines, products)) {
    return new Map<number, VatTypeSummary>();
  }

  const requestedPercentages = uniqueNumbers(
    lines.map((line) => normalizeVatPercentage(line.vatRatePercent)),
  );
  if (requestedPercentages.length === 0) {
    return new Map<number, VatTypeSummary>();
  }

  const vatResponse = await ctx.tripletex.get<ListResponse<VatTypeSummary>>(
    "/ledger/vatType",
    {
      query: {
        typeOfVat: "OUTGOING",
        vatDate: invoiceDate,
        fields: "*",
      },
    },
  );
  const vatTypes = vatResponse.values ?? [];
  const mapping = new Map<number, VatTypeSummary>();

  for (const percentage of requestedPercentages) {
    const vatType = vatTypes.find(
      (candidate) => normalizeVatPercentage(candidate.percentage) === percentage,
    );
    if (!vatType) {
      throw new Error(
        `Tripletex did not return an outgoing VAT type for ${percentage}%.`,
      );
    }
    mapping.set(percentage, vatType);
  }

  return mapping;
}

function buildInvoicePayload(
  customerId: number,
  invoiceDate: string,
  invoiceDueDate: string,
  lines: readonly CreateCustomerInvoiceLineInput[],
  products: ReadonlyMap<number, ProductSummary>,
  vatTypes: ReadonlyMap<number, VatTypeSummary>,
) {
  return {
    invoiceDate,
    invoiceDueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: lines.map((line, index) => {
          const resolvedProduct = products.get(index);
          const vatPercentage = normalizeVatPercentage(line.vatRatePercent);
          const vatTypeId =
            (vatPercentage !== undefined ? vatTypes.get(vatPercentage)?.id : undefined) ??
            resolvedProductVatTypeId(resolvedProduct);

          if (vatPercentage !== undefined && vatTypeId === undefined) {
            throw new Error(
              `Could not resolve Tripletex VAT type ${vatPercentage}% for lines[${index}].`,
            );
          }

          if (vatPercentage === undefined && vatTypeId === undefined) {
            throw new Error(
              `lines[${index}] must include vatRatePercent or reference a product with a reusable vatType.id.`,
            );
          }

          return {
            ...(resolvedProduct ? { product: { id: resolvedProduct.id } } : {}),
            description: line.description,
            count: line.quantity,
            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatNok,
            ...(vatTypeId !== undefined ? { vatType: { id: vatTypeId } } : {}),
          };
        }),
      },
    ],
  };
}

async function createInvoice(
  ctx: StrategyContext,
  body: Record<string, unknown>,
): Promise<ResponseWrapper<InvoiceSummary>> {
  return ctx.tripletex.post<ResponseWrapper<InvoiceSummary>>("/invoice", {
    query: {
      sendToCustomer: false,
    },
    body,
  });
}

async function repairMissingCompanyBankAccount(
  ctx: StrategyContext,
): Promise<void> {
  const accountResponse = await ctx.tripletex.get<ListResponse<LedgerAccountSummary>>(
    "/ledger/account",
    {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    },
  );
  const accounts = accountResponse.values ?? [];
  const account =
    accounts.find(
      (candidate) =>
        candidate.isInvoiceAccount === true && Number(candidate.number) === 1920,
    ) ??
    accounts.find((candidate) => candidate.isInvoiceAccount === true) ??
    accounts.find((candidate) => Number(candidate.number) === 1920) ??
    accounts[0];

  if (!account) {
    throw new Error(
      "Tripletex required a company bank account, but no bank ledger account was available for repair.",
    );
  }

  const existingNumbers = new Set(
    accounts
      .map((candidate) => candidate.bankAccountNumber)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const bankAccountNumber = generateUniqueBankAccountNumber(existingNumbers);

  await ctx.tripletex.put(`/ledger/account/${account.id}`, {
    body: {
      id: account.id,
      ...(typeof account.version === "number" ? { version: account.version } : {}),
      bankAccountNumber,
    },
  });
}

function buildDirectProductLookupPath(
  indexedLines: ReadonlyArray<{
    line: CreateCustomerInvoiceLineInput;
    index: number;
  }>,
): string {
  const productNumberQuery = indexedLines
    .map(({ line }) => normalizeProductRef(line.productNumber))
    .filter((value): value is string => typeof value === "string")
    .map((value) => `productNumber=${encodeURIComponent(value)}`)
    .join("&");

  return `/product?${productNumberQuery}&fields=*`;
}

function matchProducts(
  indexedLines: ReadonlyArray<{
    line: CreateCustomerInvoiceLineInput;
    index: number;
  }>,
  products: readonly ProductSummary[],
): Map<number, ProductSummary> {
  const result = new Map<number, ProductSummary>();

  for (const { line, index } of indexedLines) {
    const byRef = findExactProductByRef(products, line.productNumber);
    if (byRef) {
      result.set(index, byRef);
      continue;
    }

    const byName = findExactProductByName(
      products,
      line.productName ?? line.description,
    );
    if (byName) {
      result.set(index, byName);
    }
  }

  return result;
}

function findExactProductByRef(
  products: readonly ProductSummary[],
  rawProductNumber: string | undefined,
): ProductSummary | undefined {
  const productNumber = normalizeProductRef(rawProductNumber);
  if (!productNumber) {
    return undefined;
  }

  const matches = products.filter(
    (product) => normalizeProductRef(product.number ?? product.productNumber) === productNumber,
  );
  if (matches.length === 1) {
    return matches[0];
  }

  return undefined;
}

function findExactProductByName(
  products: readonly ProductSummary[],
  rawProductName: string | undefined,
): ProductSummary | undefined {
  const productName = normalizeProductName(rawProductName);
  if (!productName) {
    return undefined;
  }

  const matches = products.filter(
    (product) => normalizeProductName(product.name) === productName,
  );
  if (matches.length === 1) {
    return matches[0];
  }

  return undefined;
}

function pickCustomer(
  customers: readonly CustomerSummary[],
  organizationNumber: string,
  customerName: string | undefined,
): CustomerSummary {
  const orgMatches = customers.filter(
    (customer) =>
      normalizeOrganizationNumber(customer.organizationNumber) === organizationNumber,
  );
  if (orgMatches.length === 0) {
    throw new Error(
      `Expected an existing customer with organization number ${organizationNumber}, but none was found.`,
    );
  }

  if (orgMatches.length === 1) {
    return orgMatches[0];
  }

  const normalizedName = customerName?.trim();
  if (normalizedName) {
    const exactNameMatches = orgMatches.filter(
      (customer) =>
        typeof customer.name === "string" &&
        sameText(customer.name.trim(), normalizedName),
    );
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }
  }

  throw new Error(
    `Expected exactly one customer with organization number ${organizationNumber}, but found ${orgMatches.length}.`,
  );
}

function assertInvoiceLines(
  lines: readonly CreateCustomerInvoiceLineInput[],
): void {
  if (lines.length === 0) {
    throw new Error("lines must contain at least one invoice line.");
  }

  for (const [index, line] of lines.entries()) {
    if (!line.description.trim()) {
      throw new Error(`lines[${index}].description must be non-empty.`);
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error(`lines[${index}].quantity must be a positive number.`);
    }
    if (
      !Number.isFinite(line.unitPriceExcludingVatNok) ||
      line.unitPriceExcludingVatNok < 0
    ) {
      throw new Error(
        `lines[${index}].unitPriceExcludingVatNok must be a non-negative number.`,
      );
    }
  }
}

function requireValue<TValue>(
  value: TValue | undefined,
  entityName: string,
): TValue {
  if (value === undefined) {
    throw new Error(`Tripletex did not return a ${entityName} payload.`);
  }

  return value;
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return an ${entityName} id.`);
  }

  return value;
}

function needsBankAccountRepair(error: unknown): error is TripletexHttpError {
  return (
    error instanceof TripletexHttpError &&
    error.status === 422 &&
    error.message.includes(
      "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
    )
  );
}

function normalizeOrganizationNumber(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "");
}

function normalizeProductRef(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeProductName(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeVatPercentage(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid vatRatePercent value "${value}".`);
  }

  return num;
}

function uniqueNumbers(values: readonly (number | undefined)[]): number[] {
  return [...new Set(values.filter((value): value is number => value !== undefined))];
}

function needsExplicitVatLookup(
  lines: readonly CreateCustomerInvoiceLineInput[],
  products: ReadonlyMap<number, ProductSummary>,
): boolean {
  return lines.some((line, index) => {
    const explicitVatPercentage = normalizeVatPercentage(line.vatRatePercent);
    if (explicitVatPercentage === undefined) {
      return false;
    }

    const resolvedProduct = products.get(index);
    const resolvedVatTypeId = resolvedProductVatTypeId(resolvedProduct);
    if (resolvedVatTypeId === undefined) {
      return true;
    }

    const resolvedVatPercentage = normalizeVatPercentage(
      resolvedProduct?.vatType?.percentage,
    );
    return (
      resolvedVatPercentage !== undefined &&
      resolvedVatPercentage !== explicitVatPercentage
    );
  });
}

function resolvedProductVatTypeId(
  product: ProductSummary | undefined,
): number | undefined {
  return typeof product?.vatType?.id === "number" ? product.vatType.id : undefined;
}

function sameText(left: unknown, right: unknown): boolean {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { sensitivity: "base" }) === 0;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function computeNorwegianBankAccountCheckDigit(first10: string): string | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split("")
    .reduce(
      (total, digit, index) => total + Number(digit) * weights[index],
      0,
    );
  const remainder = sum % 11;
  const checkDigit = 11 - remainder;

  if (checkDigit === 11) {
    return "0";
  }
  if (checkDigit === 10) {
    return null;
  }

  return String(checkDigit);
}

function generateUniqueBankAccountNumber(existing: ReadonlySet<string>): string {
  for (let candidate = 1200000000; candidate <= 1299999999; candidate += 1) {
    const first10 = String(candidate);
    const checkDigit = computeNorwegianBankAccountCheckDigit(first10);
    if (!checkDigit) {
      continue;
    }

    const bankAccountNumber = `${first10}${checkDigit}`;
    if (!existing.has(bankAccountNumber)) {
      return bankAccountNumber;
    }
  }

  throw new Error("Could not generate a unique checksum-valid bank account number.");
}
