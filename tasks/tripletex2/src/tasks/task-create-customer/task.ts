import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_CUSTOMER_TASK_ID = "create-customer";
export const CREATE_CUSTOMER_TX_TASK_ID = "01";
export const CREATE_CUSTOMER_INPUT_SCHEMA_ID = "create-customer.v1";
export interface CreateCustomerPostalAddressInput {
  addressLine1: string;
  postalCode: string;
  city: string;
}

export interface CreateCustomerInput {
  customerName: string;
  organizationNumber: string;
  email: string;
  postalAddress?: CreateCustomerPostalAddressInput;
}
export const task = {
  taskId: CREATE_CUSTOMER_TASK_ID,
  txTaskId: CREATE_CUSTOMER_TX_TASK_ID,
  taskName: "Create customer",
  implementationStatus: "implemented",
  signature:
    "createCustomer(customerName, organizationNumber, email, postalAddress?)",
  summary:
    "Create a customer with organization number, address, and contact email.",
  inputSchemaId: CREATE_CUSTOMER_INPUT_SCHEMA_ID,
  requiredFields: [
    "customerName",
    "organizationNumber",
    "email",
  ] as const,
  optionalFields: [
    "postalAddress",
  ] as const,
  fieldDescriptions: {
    customerName:
      "Exact customer name to create in Tripletex.",
    organizationNumber:
      "Norwegian organization number for the new customer.",
    email:
      "Generic contact email for the customer card.",
    postalAddress:
      "Optional ordinary mailing address with address line, postal code, and city.",
  },
  extractionNotes: [
    "Preserve prompt text exactly for customer names and address fields, including Unicode.",
    "Map one ordinary mailing address into postalAddress only; do not invent physicalAddress or invoiceEmail.",
    "Treat localized generic email labels as the same contact email field.",
  ] as const,
} satisfies TaskSpec<CreateCustomerInput, typeof CREATE_CUSTOMER_TASK_ID>;
export type CreateCustomerStrategy = TaskStrategy<
  CreateCustomerInput,
  typeof CREATE_CUSTOMER_TASK_ID
>;
export type CreateCustomerTaskModule = TaskModule<
  CreateCustomerInput,
  typeof CREATE_CUSTOMER_TASK_ID
>;
export type CreateCustomerTaskUnderstandingResult = TaskUnderstandingResult<
  CreateCustomerInput,
  typeof CREATE_CUSTOMER_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateCustomerTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateCustomerInput, typeof CREATE_CUSTOMER_TASK_ID>;