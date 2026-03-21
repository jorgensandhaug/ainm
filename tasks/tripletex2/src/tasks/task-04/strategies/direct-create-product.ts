import type { StrategyResult } from "../../../runtime/contracts";
import type { CreateProductInput, CreateProductStrategy } from "../task";
import { CREATE_PRODUCT_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface VatTypeSummary {
  id: number;
  number?: string;
  percentage?: number;
}

interface ProductSummary {
  id: number;
  name?: string;
  number?: string | number;
  priceExcludingVatCurrency?: number;
  priceIncludingVatCurrency?: number;
  vatType?: {
    id?: number;
  };
}

export const strategy = {
  strategyId: "04.direct-create-product.v1",
  strategyPath: "src/tasks/task-04/strategies/direct-create-product.ts",
  taskId: CREATE_PRODUCT_TASK_ID,
  name: "Direct create product",
  summary:
    "Creates the requested product in the proven lowest-call path, using the 25% shortcut when possible and a filtered outgoing VAT lookup otherwise.",
  hypothesis:
    "Production proved that exact standard-25% product creation can score with one POST /product, while non-standard VAT still requires one decisive GET /ledger/vatType before the product write.",
  expectedCallProfile: {
    targetCalls: 1,
    maxCalls: 2,
  },
  stepOutline: [
    "Validate the requested name, number, price, and VAT rate.",
    "If the requested VAT rate is the standard 25%, POST /product with the prompt-required fields only.",
    "Otherwise GET /ledger/vatType with typeOfVat=OUTGOING for today's date and select the exact matching percentage.",
    "POST /product and verify the created product directly from response.value.",
  ],
  status: "draft",
  async run(ctx, input: CreateProductInput): Promise<StrategyResult> {
    const productName = requireNonEmptyText(input.productName, "productName");
    const productNumber = requireNonEmptyText(
      input.productNumber,
      "productNumber",
    );
    const priceExcludingVatCurrency = requireFiniteNumber(
      input.unitPriceExcludingVatNok,
      "unitPriceExcludingVatNok",
    );
    const vatRatePercent = requireFiniteNumber(
      input.vatRatePercent,
      "vatRatePercent",
    );

    if (vatRatePercent === 25) {
      const response = await ctx.tripletex.post<ResponseWrapper<ProductSummary>>(
        "/product",
        {
          body: {
            name: productName,
            number: productNumber,
            priceExcludingVatCurrency,
          },
        },
      );

      const product = requireProduct(response.value, {
        productName,
        productNumber,
        priceExcludingVatCurrency,
      });
      assertStandardVatShortcut(product, priceExcludingVatCurrency);

      return {
        createdEntityIds: {
          productId: product.id,
        },
        verification: {
          productId: product.id,
          name: product.name,
          number: product.number,
          priceExcludingVatCurrency: product.priceExcludingVatCurrency,
          priceIncludingVatCurrency: product.priceIncludingVatCurrency,
          vatTypeId: product.vatType?.id,
          usedVatShortcut: true,
        },
      };
    }

    const vatDate = ctx.clock.today();
    const vatTypeResponse = await ctx.tripletex.get<ListResponse<VatTypeSummary>>(
      "/ledger/vatType",
      {
        query: {
          typeOfVat: "OUTGOING",
          vatDate,
          fields: "*",
        },
      },
    );
    const vatType = chooseVatType(vatTypeResponse.values ?? [], vatRatePercent);

    const response = await ctx.tripletex.post<ResponseWrapper<ProductSummary>>(
      "/product",
      {
        body: {
          name: productName,
          number: productNumber,
          priceExcludingVatCurrency,
          vatType: { id: vatType.id },
        },
      },
    );

    const product = requireProduct(response.value, {
      productName,
      productNumber,
      priceExcludingVatCurrency,
    });
    assertApproximateNumber(
      product.priceIncludingVatCurrency,
      priceExcludingVatCurrency * (1 + vatRatePercent / 100),
      "priceIncludingVatCurrency",
    );

    if (product.vatType?.id !== vatType.id) {
      throw new Error(
        `Tripletex returned vatType.id ${JSON.stringify(product.vatType?.id)} instead of ${vatType.id}.`,
      );
    }

    return {
      createdEntityIds: {
        productId: product.id,
      },
      verification: {
        productId: product.id,
        name: product.name,
        number: product.number,
        priceExcludingVatCurrency: product.priceExcludingVatCurrency,
        priceIncludingVatCurrency: product.priceIncludingVatCurrency,
        vatTypeId: product.vatType?.id,
        requestedVatRatePercent: vatRatePercent,
        vatDate,
        usedVatShortcut: false,
      },
    };
  },
} satisfies CreateProductStrategy;

function requireNonEmptyText(value: string, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function requireFiniteNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  return value;
}

function requireProduct(
  product: ProductSummary | undefined,
  expected: {
    productName: string;
    productNumber: string;
    priceExcludingVatCurrency: number;
  },
): ProductSummary {
  if (!product || typeof product.id !== "number") {
    throw new Error("Tripletex did not return the created product.");
  }

  if (product.name !== expected.productName) {
    throw new Error(
      `Tripletex returned product name ${JSON.stringify(product.name)} instead of ${JSON.stringify(expected.productName)}.`,
    );
  }

  if (String(product.number ?? "") !== expected.productNumber) {
    throw new Error(
      `Tripletex returned product number ${JSON.stringify(product.number)} instead of ${JSON.stringify(expected.productNumber)}.`,
    );
  }

  assertApproximateNumber(
    product.priceExcludingVatCurrency,
    expected.priceExcludingVatCurrency,
    "priceExcludingVatCurrency",
  );

  return product;
}

function assertStandardVatShortcut(
  product: ProductSummary,
  priceExcludingVatCurrency: number,
): void {
  assertApproximateNumber(
    product.priceIncludingVatCurrency,
    priceExcludingVatCurrency * 1.25,
    "priceIncludingVatCurrency",
  );

  if (typeof product.vatType?.id !== "number") {
    throw new Error(
      "Tripletex did not return a vatType for the created product.",
    );
  }
}

function chooseVatType(
  vatTypes: readonly VatTypeSummary[],
  requestedRatePercent: number,
): VatTypeSummary {
  const matches = vatTypes.filter((vatType) =>
    sameNumber(vatType.percentage, requestedRatePercent),
  );

  if (matches.length === 0) {
    throw new Error(
      `Tripletex did not return an OUTGOING VAT type for ${requestedRatePercent}%.`,
    );
  }

  return (
    matches.find((vatType) => /^\d+$/.test(String(vatType.number ?? ""))) ??
    matches[0]
  );
}

function assertApproximateNumber(
  actual: number | undefined,
  expected: number,
  fieldName: string,
): void {
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    throw new Error(`Tripletex did not return ${fieldName}.`);
  }

  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(
      `Tripletex returned ${fieldName}=${actual} instead of ${expected}.`,
    );
  }
}

function sameNumber(left: number | undefined, right: number): boolean {
  return typeof left === "number" && Math.abs(left - right) <= 0.000001;
}
