import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  CreateOrderInvoiceAndRegisterPaymentInput,
  CreateOrderInvoiceAndRegisterPaymentLineInput,
  CreateOrderInvoiceAndRegisterPaymentStrategy,
} from "../task";
import { CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID } from "../task";

interface AccountSummary {
  id: number;
  number?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
}

interface CustomerSummary {
  id: number;
  name?: string;
  organizationNumber?: string;
}

interface ProductSummary {
  id: number;
  name?: string;
  productNumber?: string;
  number?: string;
}

interface PaymentTypeSummary {
  id: number;
  name?: string;
  debitAccount?: AccountSummary | null;
  creditAccount?: AccountSummary | null;
}

interface OrderSummary {
  id?: number;
}

interface InvoiceSummary {
  id?: number;
  invoiceNumber?: number;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ProductResolutionResult {
  products: ProductSummary[];
  usedIdsFallback: boolean;
  usedCatalogFallback: boolean;
}

const FULL_PAYMENT_SEED_AMOUNT = 0.01;
const BANK_ACCOUNT_VALIDATION_MESSAGE =
  "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.";

export const strategy = {
  strategyId: "11.order-invoice-combined-payment.v1",
  strategyPath:
    "src/tasks/task-11/strategies/order-invoice-combined-payment.ts",
  taskId: CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID,
  name: "Order, invoice, and combined payment",
  summary:
    "Resolves the customer, products, and payment type first, then creates the order and settles the invoice in the same invoice write.",
  hypothesis:
    "The best production flow for exact existing-customer plus existing-product prompts is the 5-call branch that combines invoice creation and payment instead of defaulting to a second payment write.",
  expectedCallProfile: {
    targetCalls: 5,
    maxCalls: 8,
  },
  stepOutline: [
    "API call 1: GET /customer by organization number to resolve the existing customer ID.",
    "API call 2: GET /product using repeated productNumber params, with deterministic fallbacks only if exact product resolution is incomplete.",
    "API call 3: GET /invoice/paymentType to resolve one usable incoming payment type.",
    "API call 4: POST /order with embedded order lines in prompt order.",
    "API call 5: PUT /order/{id}/:invoice with paymentTypeId, paidAmount=0.01, and paymentTypeIdRestAmount to settle the invoice immediately.",
    "Conditional recovery: repair one bank account and retry the same invoice write if the company-bank-account prerequisite blocks invoice creation, and use one standalone invoice payment call only if the invoice still has a remaining balance afterward.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: CreateOrderInvoiceAndRegisterPaymentInput,
  ): Promise<StrategyResult> {
    assertNonEmptyLines(input.lines);
    for (const line of input.lines) {
      assertPositiveNumber(line.quantity, "lines.quantity");
      assertPositiveNumber(
        line.unitPriceExcludingVatNok,
        "lines.unitPriceExcludingVatNok",
      );
    }

    const invoiceDate = input.invoiceDate ?? ctx.clock.today();
    const normalizedOrganizationNumber = normalizeOrganizationNumber(
      input.customerOrganizationNumber,
    );

    const customerResponse = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
      "/customer",
      {
        query: {
          organizationNumber: normalizedOrganizationNumber,
          count: 10,
          fields: "*",
        },
      },
    );
    const customer = pickExactCustomer(
      customerResponse.values ?? [],
      normalizedOrganizationNumber,
      input.customerName,
    );

    const productResolution = await resolveProducts(ctx, input.lines);

    const paymentTypeResponse = await ctx.tripletex.get<ListResponse<PaymentTypeSummary>>(
      "/invoice/paymentType",
      {
        query: {
          count: 1000,
          fields: "*,debitAccount(*),creditAccount(*)",
        },
      },
    );
    const paymentType = choosePaymentType(paymentTypeResponse.values ?? []);

    const orderResponse = await ctx.tripletex.post<ResponseWrapper<OrderSummary>>(
      "/order",
      {
        body: {
          customer: { id: customer.id },
          orderDate: invoiceDate,
          deliveryDate: invoiceDate,
          orderLines: input.lines.map((line, index) => ({
            product: { id: productResolution.products[index].id },
            description: line.description,
            count: line.quantity,
            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatNok,
          })),
        },
      },
    );
    const orderId = requireId(orderResponse.value?.id, "order");

    let invoiceResponse = await createInvoiceWithCombinedPayment(
      ctx,
      orderId,
      invoiceDate,
      paymentType.id,
    );

    const invoiceId = requireId(invoiceResponse.value?.id, "invoice");
    let remainingOutstanding = readOutstandingAmount(invoiceResponse.value);
    let usedStandalonePaymentFallback = false;

    if (remainingOutstanding !== 0) {
      usedStandalonePaymentFallback = true;
      const paymentResponse = await ctx.tripletex.put<ResponseWrapper<InvoiceSummary>>(
        `/invoice/${invoiceId}/:payment`,
        {
          query: {
            paymentDate: invoiceDate,
            paymentTypeId: paymentType.id,
            paidAmount: remainingOutstanding,
          },
        },
      );
      invoiceResponse = paymentResponse;
      remainingOutstanding = readOutstandingAmount(paymentResponse.value);
    }

    if (remainingOutstanding !== 0) {
      throw new Error(
        `Expected the invoice to be fully paid, but remaining outstanding amount was ${remainingOutstanding}.`,
      );
    }

    const notes: string[] = [];
    const requestedCustomerName = input.customerName?.trim();
    const matchedCustomerName = customer.name?.trim();
    if (
      requestedCustomerName &&
      matchedCustomerName &&
      !sameText(requestedCustomerName, matchedCustomerName)
    ) {
      notes.push(
        `Customer lookup matched organization number ${normalizedOrganizationNumber}, but the stored name "${matchedCustomerName}" differed from extracted input "${requestedCustomerName}".`,
      );
    }
    if (productResolution.usedIdsFallback) {
      notes.push(
        "Product resolution required the numeric ids fallback after the repeated productNumber lookup was incomplete.",
      );
    }
    if (productResolution.usedCatalogFallback) {
      notes.push(
        "Product resolution required one catalog read fallback to resolve the requested lines locally.",
      );
    }
    if (usedStandalonePaymentFallback) {
      notes.push(
        "The combined invoice write left a remaining balance, so the strategy finished with one standalone invoice payment call.",
      );
    }

    return {
      createdEntityIds: {
        customerId: customer.id,
        orderId,
        invoiceId,
      },
      notes,
      verification: {
        invoiceDate,
        invoiceNumber: invoiceResponse.value?.invoiceNumber,
        paymentTypeId: paymentType.id,
        sendToCustomerRequested: false,
        remainingOutstanding,
        usedStandalonePaymentFallback,
      },
    };
  },
} satisfies CreateOrderInvoiceAndRegisterPaymentStrategy;

async function resolveProducts(
  ctx: StrategyContext,
  lines: readonly CreateOrderInvoiceAndRegisterPaymentLineInput[],
): Promise<ProductResolutionResult> {
  const resolvedProducts = new Array<ProductSummary | undefined>(lines.length);
  let usedIdsFallback = false;
  let usedCatalogFallback = false;

  const numericRefs = uniqueValues(
    lines
      .map((line) => normalizeOptionalText(line.productNumber))
      .filter((value): value is string => value !== undefined),
  );

  if (numericRefs.length > 0) {
    const byProductNumberResponse = await ctx.tripletex.get<ListResponse<ProductSummary>>(
      buildProductLookupPath("productNumber", numericRefs),
    );
    assignResolvedProductsFromLookup(
      resolvedProducts,
      lines,
      byProductNumberResponse.values ?? [],
      getProductNumberLikeValue,
    );
  }

  const unresolvedNumericRefs = uniqueValues(
    lines
      .map((line, index) => ({
        index,
        productNumber: normalizeOptionalText(line.productNumber),
      }))
      .filter(
        (entry): entry is { index: number; productNumber: string } =>
          entry.productNumber !== undefined &&
          resolvedProducts[entry.index] === undefined,
      )
      .map((entry) => entry.productNumber),
  );

  if (unresolvedNumericRefs.length > 0) {
    usedIdsFallback = true;
    const byIdsResponse = await ctx.tripletex.get<ListResponse<ProductSummary>>(
      "/product",
      {
        query: {
          ids: unresolvedNumericRefs.join(","),
          fields: "*",
        },
      },
    );
    assignResolvedProductsFromLookup(
      resolvedProducts,
      lines,
      byIdsResponse.values ?? [],
      (product) => normalizeOptionalText(product.id),
    );
  }

  const unresolvedIndexes = resolvedProducts
    .map((product, index) => (product ? undefined : index))
    .filter((value): value is number => value !== undefined);

  if (unresolvedIndexes.length > 0) {
    const unresolvedLines = unresolvedIndexes.map((index) => lines[index]);
    const missingNames = unresolvedLines.filter(
      (line) => normalizeOptionalText(line.productName) === undefined,
    );
    if (missingNames.length > 0) {
      throw new Error(
        "Could not resolve every requested product by numeric reference, and one or more unresolved lines did not include productName for the decisive catalog fallback.",
      );
    }

    usedCatalogFallback = true;
    const catalogResponse = await ctx.tripletex.get<ListResponse<ProductSummary>>(
      "/product",
      {
        query: {
          count: 1000,
          fields: "*",
        },
      },
    );
    const catalog = catalogResponse.values ?? [];

    for (const index of unresolvedIndexes) {
      resolvedProducts[index] = resolveProductFromCatalog(catalog, lines[index]);
    }
  }

  if (resolvedProducts.some((product) => product === undefined)) {
    throw new Error("Product resolution failed for one or more order lines.");
  }

  return {
    products: resolvedProducts,
    usedIdsFallback,
    usedCatalogFallback,
  };
}

function assignResolvedProductsFromLookup(
  resolvedProducts: Array<ProductSummary | undefined>,
  lines: readonly CreateOrderInvoiceAndRegisterPaymentLineInput[],
  products: readonly ProductSummary[],
  getLookupValue: (product: ProductSummary) => string | undefined,
): void {
  const productMap = new Map<string, ProductSummary>();
  for (const product of products) {
    const lookupValue = getLookupValue(product);
    if (lookupValue) {
      productMap.set(lookupValue, product);
    }
  }

  for (const [index, line] of lines.entries()) {
    if (resolvedProducts[index]) {
      continue;
    }
    const productNumber = normalizeOptionalText(line.productNumber);
    if (!productNumber) {
      continue;
    }
    const match = productMap.get(productNumber);
    if (match) {
      resolvedProducts[index] = match;
    }
  }
}

function resolveProductFromCatalog(
  products: readonly ProductSummary[],
  line: CreateOrderInvoiceAndRegisterPaymentLineInput,
): ProductSummary {
  const productNumber = normalizeOptionalText(line.productNumber);
  const productName = normalizeOptionalText(line.productName);

  if (productNumber && productName) {
    const exact = products.filter(
      (product) =>
        getProductNumberLikeValue(product) === productNumber &&
        sameText(product.name ?? "", productName),
    );
    if (exact.length === 1) {
      return exact[0];
    }
  }

  if (productName) {
    const exactNameMatches = products.filter((product) =>
      sameText(product.name ?? "", productName),
    );
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }
  }

  if (productNumber) {
    const exactNumberMatches = products.filter(
      (product) => getProductNumberLikeValue(product) === productNumber,
    );
    if (exactNumberMatches.length === 1) {
      return exactNumberMatches[0];
    }
  }

  throw new Error(
    `Unable to resolve a unique product for line "${line.description}".`,
  );
}

async function createInvoiceWithCombinedPayment(
  ctx: StrategyContext,
  orderId: number,
  invoiceDate: string,
  paymentTypeId: number,
): Promise<ResponseWrapper<InvoiceSummary>> {
  try {
    return await ctx.tripletex.put<ResponseWrapper<InvoiceSummary>>(
      `/order/${orderId}/:invoice`,
      {
        query: {
          invoiceDate,
          sendToCustomer: false,
          paymentTypeId,
          paidAmount: FULL_PAYMENT_SEED_AMOUNT,
          paymentTypeIdRestAmount: paymentTypeId,
        },
      },
    );
  } catch (error) {
    if (!isMissingBankAccountError(error)) {
      throw error;
    }

    const bankAccountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          isBankAccount: true,
          fields: "*",
        },
      },
    );
    const bankAccount = chooseRepairableBankAccount(
      bankAccountResponse.values ?? [],
    );

    await ctx.tripletex.put(`/ledger/account/${bankAccount.id}`, {
      body: {
        bankAccountNumber: chooseRepairBankAccountNumber(
          bankAccount.bankAccountNumber,
        ),
      },
    });

    return ctx.tripletex.put<ResponseWrapper<InvoiceSummary>>(
      `/order/${orderId}/:invoice`,
      {
        query: {
          invoiceDate,
          sendToCustomer: false,
          paymentTypeId,
          paidAmount: FULL_PAYMENT_SEED_AMOUNT,
          paymentTypeIdRestAmount: paymentTypeId,
        },
      },
    );
  }
}

function pickExactCustomer(
  customers: readonly CustomerSummary[],
  organizationNumber: string,
  requestedName?: string,
): CustomerSummary {
  const organizationMatches = customers.filter(
    (customer) =>
      normalizeOrganizationNumber(customer.organizationNumber) ===
      organizationNumber,
  );

  if (organizationMatches.length === 0) {
    throw new Error(
      `Expected an existing customer with organization number ${organizationNumber}, but none was found.`,
    );
  }

  if (organizationMatches.length === 1) {
    return organizationMatches[0];
  }

  const normalizedRequestedName = normalizeOptionalText(requestedName);
  if (normalizedRequestedName) {
    const exactNameMatches = organizationMatches.filter((customer) =>
      sameText(customer.name ?? "", normalizedRequestedName),
    );
    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }
  }

  throw new Error(
    `Expected exactly one customer with organization number ${organizationNumber}, but found ${organizationMatches.length}.`,
  );
}

function choosePaymentType(
  paymentTypes: readonly PaymentTypeSummary[],
): PaymentTypeSummary {
  const bankCandidates = paymentTypes
    .map((paymentType) => ({
      paymentType,
      debitAccountNumber: normalizeAccountNumber(paymentType.debitAccount?.number),
    }))
    .filter(({ debitAccountNumber }) => debitAccountNumber.startsWith("19"));

  const preferredBankCandidate =
    bankCandidates.find(
      ({ paymentType }) =>
        paymentType.debitAccount?.isBankAccount === true ||
        paymentType.debitAccount?.isInvoiceAccount === true,
    ) ??
    bankCandidates.find(({ paymentType }) =>
      sameText(paymentType.name ?? "", "Betalt til bank"),
    ) ??
    bankCandidates[0];

  if (preferredBankCandidate) {
    return preferredBankCandidate.paymentType;
  }

  if (paymentTypes.length === 0) {
    throw new Error("Tripletex did not return any invoice payment types.");
  }

  return paymentTypes[0];
}

function chooseRepairableBankAccount(
  accounts: readonly AccountSummary[],
): AccountSummary {
  const preferred =
    accounts.find((account) => account.isInvoiceAccount === true) ?? accounts[0];

  if (!preferred?.id) {
    throw new Error("Tripletex did not return a bank account that can be repaired.");
  }

  return preferred;
}

function chooseRepairBankAccountNumber(existingValue: string | undefined): string {
  const normalized = normalizeAccountNumber(existingValue);
  if (/^\d{11}$/.test(normalized)) {
    return normalized;
  }

  return "12345678903";
}

function readOutstandingAmount(invoice: InvoiceSummary | undefined): number {
  const value =
    invoice?.amountCurrencyOutstanding ?? invoice?.amountOutstanding;
  const normalized = Number(value ?? Number.NaN);

  if (!Number.isFinite(normalized)) {
    throw new Error(
      "Tripletex did not return amountCurrencyOutstanding or amountOutstanding on the invoice response.",
    );
  }

  return normalized;
}

function buildProductLookupPath(key: string, values: readonly string[]): string {
  const pairs = values.map(
    (value) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
  );
  pairs.push("fields=*");
  return `/product?${pairs.join("&")}`;
}

function getProductNumberLikeValue(product: ProductSummary): string | undefined {
  return normalizeOptionalText(product.productNumber ?? product.number);
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return an ${entityName} id.`);
  }

  return value;
}

function assertNonEmptyLines(
  lines: readonly CreateOrderInvoiceAndRegisterPaymentLineInput[],
): void {
  if (lines.length === 0) {
    throw new Error("lines must contain at least one order line.");
  }
}

function assertPositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}

function normalizeOrganizationNumber(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeAccountNumber(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) === 0;
}

function isMissingBankAccountError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(BANK_ACCOUNT_VALIDATION_MESSAGE);
}
