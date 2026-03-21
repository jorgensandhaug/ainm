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
  invoiceSendMethod?: InvoiceSendMethod;
  invoiceEmail?: string;
  email?: string;
  postalAddress?: unknown;
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

type InvoiceSendMethod =
  | "EMAIL"
  | "EHF"
  | "EFAKTURA"
  | "AVTALEGIRO"
  | "VIPPS"
  | "PAPER"
  | "MANUAL";

export const strategy = {
  strategyId: "08.order-then-invoice-then-send.v1",
  strategyPath:
    "src/tasks/task-08/strategies/order-then-invoice-then-send.ts",
  taskId: CREATE_AND_SEND_INVOICE_TASK_ID,
  name: "Order then invoice then explicit send",
  summary:
    "Looks up the customer's configured invoice send method, resolves an outgoing VAT type, creates the invoice without auto-send, then dispatches it through the explicit invoice send endpoint.",
  hypothesis:
    "Separating invoice creation from dispatch matches the proven live sandbox flow and keeps send behavior inspectable when auto-send is unreliable.",
  expectedCallProfile: {
    targetCalls: 4,
    maxCalls: 4,
  },
  stepOutline: [
    "API call 1: GET /customer by organization number to resolve the customer ID and invoiceSendMethod.",
    "API call 2: GET /ledger/vatType to resolve a valid outgoing VAT type for the invoice date.",
    "API call 3: POST /invoice with embedded orders and sendToCustomer=false.",
    "API call 4: PUT /invoice/{id}/:send with the customer's configured invoice send type.",
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

    // API call 1: resolve the existing customer ID and dispatch method.
    const customerResponse = await ctx.tripletex.get<ListResponse<CustomerSummary>>(
      "/customer",
      {
        query: {
          organizationNumber: normalizedOrgNumber,
          count: 10,
          fields:
            "id,name,organizationNumber,invoiceSendMethod,invoiceEmail,email,postalAddress",
        },
      },
    );

    const customer = pickExactCustomer(
      customerResponse.values ?? [],
      normalizedOrgNumber,
    );
    const sendType = chooseSendType(customer);

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

    // API call 3: create the invoice first, but keep dispatch as a separate step.
    const invoiceResponse = await ctx.tripletex.post<ResponseWrapper<InvoiceSummary>>(
      "/invoice",
      {
        query: {
          sendToCustomer: false,
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

    // API call 4: dispatch the already-created invoice using the customer's configured send path.
    await ctx.tripletex.put(`/invoice/${invoiceId}/:send`, {
      query: {
        sendType,
      },
    });

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

    if (sendType === "MANUAL") {
      notes.push(
        "Customer invoiceSendMethod is MANUAL, so the explicit send step records manual dispatch rather than electronic delivery.",
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
        sendToCustomerRequested: false,
        sendTypeRequested: sendType,
        dispatchedViaExplicitInvoiceSend: true,
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

function chooseSendType(customer: CustomerSummary): InvoiceSendMethod {
  if (customer.invoiceSendMethod === "EMAIL" && (customer.invoiceEmail || customer.email)) {
    return "EMAIL";
  }

  if (customer.invoiceSendMethod === "PAPER" && customer.postalAddress) {
    return "PAPER";
  }

  if (customer.invoiceSendMethod) {
    return customer.invoiceSendMethod;
  }

  if (customer.invoiceEmail || customer.email) {
    return "EMAIL";
  }

  return "MANUAL";
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return an ${entityName} id.`);
  }

  return value;
}

function assertPositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeOrganizationNumber(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "");
}

function sameText(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "base" }) === 0;
}
