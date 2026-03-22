import type { StrategyResult } from "../../../runtime/contracts";
import type { CreateCustomerStrategy } from "../task";
import { CREATE_CUSTOMER_TASK_ID, type CreateCustomerInput } from "../task";

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface PostalAddressSummary {
  addressLine1?: string;
  postalCode?: string;
  city?: string;
}

interface CustomerSummary {
  id?: number;
  name?: string;
  organizationNumber?: string;
  email?: string;
  postalAddress?: PostalAddressSummary;
}

export const strategy = {
  strategyId: "01.create-customer-post.v1",
  strategyPath: "src/tasks/task-01/strategies/create-customer-post.ts",
  taskId: CREATE_CUSTOMER_TASK_ID,
  name: "Direct customer POST",
  summary:
    "Creates the customer in one POST /customer call, adding a single ordinary postal address when present.",
  hypothesis:
    "The trusted create-customer path is a single write whose response.value already proves the scored fields.",
  expectedCallProfile: {
    targetCalls: 1,
    maxCalls: 1,
  },
  stepOutline: [
    "API call 1: POST /customer with name, organizationNumber, email, and optional postalAddress.",
  ],
  status: "draft",
  async run(ctx, input: CreateCustomerInput): Promise<StrategyResult> {
    const payload = {
      name: assertNonEmptyText(input.customerName, "customerName"),
      organizationNumber: normalizeOrganizationNumber(input.organizationNumber),
      email: assertNonEmptyText(input.email, "email"),
      ...(input.postalAddress
        ? {
            postalAddress: {
              addressLine1: assertNonEmptyText(
                input.postalAddress.addressLine1,
                "postalAddress.addressLine1",
              ),
              postalCode: assertNonEmptyText(
                input.postalAddress.postalCode,
                "postalAddress.postalCode",
              ),
              city: assertNonEmptyText(
                input.postalAddress.city,
                "postalAddress.city",
              ),
            },
          }
        : {}),
    };

    const response = await ctx.tripletex.post<ResponseWrapper<CustomerSummary>>(
      "/customer",
      {
        body: payload,
      },
    );

    const customer = requireValue(response.value, "customer");
    const customerId = requireId(customer.id, "customer");

    assertExactMatch(customer.name, payload.name, "customer.name");
    assertExactOrganizationNumber(
      customer.organizationNumber,
      payload.organizationNumber,
      "customer.organizationNumber",
    );
    assertExactMatch(customer.email, payload.email, "customer.email");

    if (payload.postalAddress) {
      const postalAddress = requireValue(
        customer.postalAddress,
        "customer.postalAddress",
      );
      assertExactMatch(
        postalAddress.addressLine1,
        payload.postalAddress.addressLine1,
        "customer.postalAddress.addressLine1",
      );
      assertExactMatch(
        postalAddress.postalCode,
        payload.postalAddress.postalCode,
        "customer.postalAddress.postalCode",
      );
      assertExactMatch(
        postalAddress.city,
        payload.postalAddress.city,
        "customer.postalAddress.city",
      );
    }

    return {
      createdEntityIds: {
        customerId,
      },
      verification: {
        customerName: customer.name,
        organizationNumber: customer.organizationNumber,
        email: customer.email,
        postalAddress: customer.postalAddress,
      },
    };
  },
} satisfies CreateCustomerStrategy;

function assertNonEmptyText(value: unknown, fieldName: string): string {
  const normalizedValue = String(value ?? "").trim();
  if (normalizedValue.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return normalizedValue;
}

function normalizeOrganizationNumber(value: unknown): string {
  const normalizedValue = String(value ?? "").replace(/\s+/g, "");
  if (normalizedValue.length === 0) {
    throw new Error("organizationNumber must be a non-empty string.");
  }

  return normalizedValue;
}

function requireValue<TValue>(
  value: TValue | undefined,
  fieldName: string,
): TValue {
  if (!value) {
    throw new Error(`Tripletex did not return ${fieldName}.`);
  }

  return value;
}

function requireId(value: number | undefined, entityName: string): number {
  if (typeof value !== "number") {
    throw new Error(`Tripletex did not return a numeric ${entityName} id.`);
  }

  return value;
}

function assertExactMatch(
  actualValue: string | undefined,
  expectedValue: string,
  fieldName: string,
): void {
  if (actualValue !== expectedValue) {
    throw new Error(
      `Tripletex returned unexpected ${fieldName}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}.`,
    );
  }
}

function assertExactOrganizationNumber(
  actualValue: string | undefined,
  expectedValue: string,
  fieldName: string,
): void {
  if (normalizeOrganizationNumber(actualValue ?? "") !== expectedValue) {
    throw new Error(
      `Tripletex returned unexpected ${fieldName}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}.`,
    );
  }
}
