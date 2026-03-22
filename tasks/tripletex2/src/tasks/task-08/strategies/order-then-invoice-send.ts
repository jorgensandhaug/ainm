import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  CreateAndSendInvoiceInput,
  CreateAndSendInvoiceStrategy,
} from "../task";
import { CREATE_AND_SEND_INVOICE_TASK_ID } from "../task";

interface CustomerSummary {
  id: number;
  name?: string;
  organizationNumber?: string;
}

interface VatTypeSummary {
  id: number;
  percentage?: number;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface InvoiceSummary {
  id: number;
  invoiceNumber?: number;
}

export const strategy = {
  strategyId: "08.order-then-invoice-send.v1",
  strategyPath:
    "src/tasks/task-08/strategies/order-then-invoice-send.ts",
  taskId: CREATE_AND_SEND_INVOICE_TASK_ID,
  name: "Order then invoice+send",
  summary:
    "Looks up an existing customer, resolves an outgoing VAT type, then creates and sends an invoice in one Tripletex invoice call with embedded orders.",
  hypothesis:
    "Using POST /invoice with embedded orders matches the proven live sandbox flow while still preserving the lower-call auto-send candidate.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 3,
  },
  stepOutline: [
    "API call 1: GET /customer by organization number to resolve the existing customer ID.",
    "API call 2: GET /ledger/vatType to resolve a valid outgoing VAT type for the invoice date.",
    "API call 3: POST /invoice with embedded orders and sendToCustomer=true.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: CreateAndSendInvoiceInput,
  ): Promise<StrategyResult> {
    assertPositiveNumber(input.quantity, "quantity");
    assertPositiveNumber(
      input.unitPriceExcludingVatNok,
      "unitPriceExcludingVatNok",
    );

    const invoiceDate = input.invoiceDate ?? ctx.clock.today();
    const normalizedOrgNumber = normalizeOrganizationNumber(
      input.organizationNumber,
    );

    // API call 1: resolve the existing customer ID.
    const customerResponse = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
      "/customer",
      {
        query: {
          organizationNumber: normalizedOrgNumber,
          count: 10,
          fields: "id,name,organizationNumber",
        },
      },
    );

    const customer = pickExactCustomer(
      customerResponse.values ?? [],
      normalizedOrgNumber,
    );

    // API call 2: resolve a valid outgoing VAT type for this invoice date.
    const vatTypeResponse = await ctx.tripletex.get<ListResponse<VatTypeSummary>>(
      "/ledger/vatType",
      {
        query: {
          typeOfVat: "OUTGOING",
          vatDate: invoiceDate,
          fields: "id,percentage",
        },
      },
    );
    const vatType = chooseOutgoingVatType(vatTypeResponse.values ?? []);

    // API call 3: create and send the invoice in one call with embedded order data.
    const invoiceResponse = await ctx.tripletex.post<ResponseWrapper<InvoiceSummary>>(
      "/invoice",
      {
        query: {
          sendToCustomer: true,
        },
        body: {
          invoiceDate,
          invoiceDueDate: addDays(invoiceDate, 14),
          customer: { id: customer.id },
          orders: [
            {
              customer: { id: customer.id },
              orderDate: invoiceDate,
              deliveryDate: invoiceDate,
              invoiceComment: input.invoiceComment,
              orderLines: [
                {
                  description: input.lineDescription,
                  count: input.quantity,
                  unitPriceExcludingVatCurrency:
                    input.unitPriceExcludingVatNok,
                  vatType: { id: vatType.id },
                },
              ],
            },
          ],
        },
      },
    );

    const invoiceId = requireId(invoiceResponse.value?.id, "invoice");
    const notes: string[] = [];
    const matchedCustomerName = customer.name?.trim();
    if (
      matchedCustomerName &&
      !sameText(matchedCustomerName, input.customerName.trim())
    ) {
      notes.push(
        `Customer lookup matched organization number ${normalizedOrgNumber}, but the stored name "${matchedCustomerName}" differed from extracted input "${input.customerName.trim()}".`,
      );
    }

    return {
      createdEntityIds: {
        customerId: customer.id,
        invoiceId,
      },
      notes,
      verification: {
        invoiceNumber: invoiceResponse.value?.invoiceNumber,
        invoiceDate,
        sendToCustomerRequested: true,
      },
    };
  },
} satisfies CreateAndSendInvoiceStrategy;

function pickExactCustomer(
  customers: readonly CustomerSummary[],
  organizationNumber: string,
): CustomerSummary {
  const matches = customers.filter(
    (customer) =>
      normalizeOrganizationNumber(customer.organizationNumber) ===
      organizationNumber,
  );

  if (matches.length === 0) {
    throw new Error(
      `Expected an existing customer with organization number ${organizationNumber}, but none was found.`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected exactly one customer with organization number ${organizationNumber}, but found ${matches.length}.`,
    );
  }

  return matches[0];
}

function chooseOutgoingVatType(
  vatTypes: readonly VatTypeSummary[],
): VatTypeSummary {
  if (vatTypes.length === 0) {
    throw new Error("Tripletex did not return any outgoing VAT types.");
  }

  return (
    vatTypes.find((vatType) => Number(vatType.percentage) === 25) ??
    [...vatTypes].sort(
      (left, right) =>
        Number(right.percentage ?? 0) - Number(left.percentage ?? 0),
    )[0]
  );
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return an ${entityName} id.`);
  }

  return value;
}

function assertPositiveNumber(value: unknown, fieldName: string): void {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeOrganizationNumber(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, "");
}

function sameText(left: unknown, right: unknown): boolean {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { sensitivity: "base" }) === 0;
}
