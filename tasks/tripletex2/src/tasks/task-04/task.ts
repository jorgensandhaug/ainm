import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_PRODUCT_TASK_ID = "04";
export const CREATE_PRODUCT_TX_TASK_ID = "04";
export const CREATE_PRODUCT_INPUT_SCHEMA_ID = "04.v1";
export interface CreateProductInput {
  productName: string;
  productNumber: string;
  unitPriceExcludingVatNok: number;
  vatRatePercent: number;
}
export const task = {
  taskId: CREATE_PRODUCT_TASK_ID,
  txTaskId: CREATE_PRODUCT_TX_TASK_ID,
  taskName: "Create product",
  implementationStatus: "implemented",
  signature:
    "createProduct(productName, productNumber, unitPriceExcludingVatNok, vatRatePercent)",
  summary:
    "Create a product with product number, price, and the required VAT treatment.",
  inputSchemaId: CREATE_PRODUCT_INPUT_SCHEMA_ID,
  requiredFields: [
    "productName",
    "productNumber",
    "unitPriceExcludingVatNok",
    "vatRatePercent",
  ] as const,
  fieldDescriptions: {
    productName:
      "Name of the product to create.",
    productNumber:
      "Prompt-provided product number/reference.",
    unitPriceExcludingVatNok:
      "Unit price excluding VAT, normalized to NOK.",
    vatRatePercent:
      "Requested VAT percentage for the product, such as 25, 15, or 0.",
  },
  extractionNotes: [
    "Normalize excluding-VAT wording from any prompt language into unitPriceExcludingVatNok.",
    "Normalize VAT expressions like 25%, 15%, and 0% into numeric vatRatePercent values.",
    "Keep the exact product name and product number from the prompt.",
  ] as const,
} satisfies TaskSpec<CreateProductInput, typeof CREATE_PRODUCT_TASK_ID>;
export type CreateProductStrategy = TaskStrategy<
  CreateProductInput,
  typeof CREATE_PRODUCT_TASK_ID
>;
export type CreateProductTaskModule = TaskModule<
  CreateProductInput,
  typeof CREATE_PRODUCT_TASK_ID
>;
export type CreateProductTaskUnderstandingResult = TaskUnderstandingResult<
  CreateProductInput,
  typeof CREATE_PRODUCT_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateProductTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateProductInput, typeof CREATE_PRODUCT_TASK_ID>;