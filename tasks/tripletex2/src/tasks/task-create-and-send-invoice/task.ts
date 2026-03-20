import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const CREATE_AND_SEND_INVOICE_TASK_ID = "create-and-send-invoice";
export const CREATE_AND_SEND_INVOICE_TX_TASK_ID = "08";
export const CREATE_AND_SEND_INVOICE_INPUT_SCHEMA_ID =
  "create-and-send-invoice.v1";

export interface CreateAndSendInvoiceInput {
  customerName: string;
  organizationNumber: string;
  lineDescription: string;
  quantity: number;
  unitPriceExcludingVatNok: number;
  invoiceDate?: string;
  invoiceComment?: string;
}

export const task = {
  taskId: CREATE_AND_SEND_INVOICE_TASK_ID,
  txTaskId: CREATE_AND_SEND_INVOICE_TX_TASK_ID,
  taskName: "Create and send invoice",
  implementationStatus: "implemented",
  signature:
    "createAndSendInvoice(customerName, organizationNumber, lineDescription, quantity, unitPriceExcludingVatNok, invoiceDate?, invoiceComment?)",
  summary:
    "Create and send an outgoing invoice for an existing customer identified by organization number.",
  inputSchemaId: CREATE_AND_SEND_INVOICE_INPUT_SCHEMA_ID,
  requiredFields: [
    "customerName",
    "organizationNumber",
    "lineDescription",
    "quantity",
    "unitPriceExcludingVatNok",
  ] as const,
  optionalFields: ["invoiceDate", "invoiceComment"] as const,
  fieldDescriptions: {
    customerName:
      "Customer name from the prompt, used for extraction clarity and mismatch notes.",
    organizationNumber:
      "Existing customer organization number used to resolve exactly one Tripletex customer.",
    lineDescription: "Invoice line description to place on the created order.",
    quantity:
      "Invoice line quantity. Extraction should normalize implicit single-line requests to 1.",
    unitPriceExcludingVatNok:
      "Invoice line unit price excluding VAT, in NOK.",
    invoiceDate:
      "Optional invoice date. If omitted, the strategy defaults to ctx.clock.today().",
    invoiceComment:
      "Optional comment copied onto the created order before invoicing.",
  },
  extractionNotes: [
    "This task assumes the customer already exists in Tripletex.",
    "The extractor should output typed values only, not a plan.",
    "If quantity is implicit in the prompt, normalize it to 1 before strategy execution.",
  ] as const,
} satisfies TaskSpec<
  CreateAndSendInvoiceInput,
  typeof CREATE_AND_SEND_INVOICE_TASK_ID
>;

export type CreateAndSendInvoiceStrategy =
  TaskStrategy<
    CreateAndSendInvoiceInput,
    typeof CREATE_AND_SEND_INVOICE_TASK_ID
  >;

export type CreateAndSendInvoiceTaskModule =
  TaskModule<
    CreateAndSendInvoiceInput,
    typeof CREATE_AND_SEND_INVOICE_TASK_ID
  >;

export type CreateAndSendInvoiceTaskUnderstandingResult =
  TaskUnderstandingResult<
    CreateAndSendInvoiceInput,
    typeof CREATE_AND_SEND_INVOICE_TASK_ID
  >;

export async function loadTaskModule(): Promise<CreateAndSendInvoiceTaskModule> {
  const [{ strategy: orderThenInvoiceSend }, { strategy: orderThenInvoiceThenSend }] =
    await Promise.all([
      import("./strategies/order-then-invoice-send"),
      import("./strategies/order-then-invoice-then-send"),
    ]);

  return {
    task,
    strategies: [orderThenInvoiceSend, orderThenInvoiceThenSend],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  CreateAndSendInvoiceInput,
  typeof CREATE_AND_SEND_INVOICE_TASK_ID
>;
