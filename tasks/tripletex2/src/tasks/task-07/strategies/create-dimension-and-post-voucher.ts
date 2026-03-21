import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  CreateAccountingDimensionAndPostVoucherInput,
  CreateAccountingDimensionAndPostVoucherStrategy,
} from "../task";
import { CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID } from "../task";

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface DimensionSummary {
  id?: number;
  dimensionIndex?: number;
  dimensionName?: string;
}

interface DimensionValueSummary {
  id?: number;
  dimensionIndex?: number;
  displayName?: string;
}

interface AccountSummary {
  id?: number;
  number?: number | string | null;
  isBankAccount?: boolean | null;
  isInvoiceAccount?: boolean | null;
}

interface VoucherSummary {
  id?: number;
  number?: number;
}

export const strategy = {
  strategyId: "07.create-dimension-and-post-voucher.v1",
  strategyPath:
    "src/tasks/task-07/strategies/create-dimension-and-post-voucher.ts",
  taskId: CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID,
  name: "Create free dimension and post voucher",
  summary:
    "Creates the requested free accounting dimension and values, resolves ledger account ids, then posts a balanced voucher linked to the chosen new dimension value.",
  hypothesis:
    "The trusted create-dimension flow stays minimal by reusing the created dimensionIndex and one decisive account lookup before the voucher write.",
  expectedCallProfile: {
    targetCalls: 5,
    maxCalls: 6,
  },
  stepOutline: [
    "API call 1: POST /ledger/accountingDimensionName.",
    "API calls 2..n: POST /ledger/accountingDimensionValue once per requested value.",
    "Next API call: GET /ledger/account for the scored account and balancing account.",
    "Final API call: POST /ledger/voucher with id-based accounts and the matching freeAccountingDimension{n} field.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: CreateAccountingDimensionAndPostVoucherInput,
  ): Promise<StrategyResult> {
    assertNonEmptyText(input.dimensionName, "dimensionName");
    assertMaxLength(input.dimensionName, 20, "dimensionName");
    assertPositiveNumber(input.amountNok, "amountNok");

    const dimensionValueNames = validateDimensionValueNames(
      input.dimensionValueNames,
    );
    const postingDimensionValueName = requireMatchingDimensionValueName(
      dimensionValueNames,
      input.postingDimensionValueName,
    );
    const voucherDate = input.voucherDate ?? ctx.clock.today();
    const requestedBalancingAccountNumber = input.balancingAccountNumber ?? 1920;

    const dimensionResponse = await ctx.tripletex.post<ResponseWrapper<DimensionSummary>>(
      "/ledger/accountingDimensionName",
      {
        body: {
          dimensionName: input.dimensionName,
          active: true,
        },
      },
    );
    const dimension = requireResponseValue(dimensionResponse, "dimension");
    const dimensionId = requireNumber(dimension.id, "dimension id");
    const dimensionIndex = requireNumber(
      dimension.dimensionIndex,
      "dimension index",
    );

    const createdValues: DimensionValueSummary[] = [];
    for (const displayName of dimensionValueNames) {
      const valueResponse = await ctx.tripletex.post<
        ResponseWrapper<DimensionValueSummary>
      >("/ledger/accountingDimensionValue", {
        body: {
          dimensionIndex,
          displayName,
          active: true,
          showInVoucherRegistration: true,
        },
      });
      createdValues.push(requireResponseValue(valueResponse, "dimension value"));
    }

    const targetValue = createdValues.find(
      (value) => value.displayName === postingDimensionValueName,
    );
    if (!targetValue?.id) {
      throw new Error(
        `Tripletex did not return the created dimension value "${postingDimensionValueName}".`,
      );
    }

    const accountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          number: `${input.postingAccountNumber},${requestedBalancingAccountNumber}`,
          fields: "*",
        },
      },
    );

    const targetAccount = pickAccountByNumber(
      accountResponse.values ?? [],
      input.postingAccountNumber,
      "posting",
    );
    const balancingAccount =
      pickOptionalAccountByNumber(
        accountResponse.values ?? [],
        requestedBalancingAccountNumber,
      ) ??
      (input.balancingAccountNumber === undefined
        ? await loadFallbackBalancingAccount(ctx)
        : undefined);

    if (!balancingAccount) {
      throw new Error(
        `Expected balancing account ${requestedBalancingAccountNumber}, but Tripletex did not return it.`,
      );
    }

    const linkedDimensionField = `freeAccountingDimension${dimensionIndex}`;
    const targetPosting: Record<string, unknown> = {
      row: 1,
      date: voucherDate,
      description: `${input.dimensionName} "${postingDimensionValueName}"`,
      account: { id: requireNumber(targetAccount.id, "posting account id") },
      currency: { id: 1 },
      amount: input.amountNok,
      amountCurrency: input.amountNok,
      amountGross: input.amountNok,
      amountGrossCurrency: input.amountNok,
    };
    targetPosting[linkedDimensionField] = { id: targetValue.id };

    const voucherResponse = await ctx.tripletex.post<ResponseWrapper<VoucherSummary>>(
      "/ledger/voucher",
      {
        body: {
          date: voucherDate,
          description: `Voucher account ${input.postingAccountNumber}, ${input.dimensionName} "${postingDimensionValueName}"`,
          voucherType: null,
          postings: [
            targetPosting,
            {
              row: 2,
              date: voucherDate,
              description: `${input.dimensionName} "${postingDimensionValueName}"`,
              account: {
                id: requireNumber(
                  balancingAccount.id,
                  "balancing account id",
                ),
              },
              currency: { id: 1 },
              amount: -input.amountNok,
              amountCurrency: -input.amountNok,
              amountGross: -input.amountNok,
              amountGrossCurrency: -input.amountNok,
            },
          ],
        },
      },
    );
    const voucher = requireResponseValue(voucherResponse, "voucher");
    const voucherId = requireNumber(voucher.id, "voucher id");

    return {
      createdEntityIds: {
        dimensionId,
        targetDimensionValueId: targetValue.id,
        voucherId,
      },
      verification: {
        dimensionIndex,
        voucherNumber: voucher.number,
        postingAccountId: targetAccount.id,
        balancingAccountId: balancingAccount.id,
        linkedDimensionField,
        createdDimensionValueIds: createdValues.map((value) =>
          requireNumber(value.id, "dimension value id"),
        ),
      },
    };
  },
} satisfies CreateAccountingDimensionAndPostVoucherStrategy;

function requireResponseValue<TValue>(
  response: ResponseWrapper<TValue>,
  label: string,
): TValue {
  if (!response.value) {
    throw new Error(`Tripletex did not return a ${label} value.`);
  }

  return response.value;
}

function validateDimensionValueNames(values: readonly string[]): string[] {
  if (values.length === 0) {
    throw new Error("dimensionValueNames must contain at least one value.");
  }

  const seen = new Set<string>();
  return values.map((value, index) => {
    assertNonEmptyText(value, `dimensionValueNames[${index}]`);
    if (seen.has(value)) {
      throw new Error(
        `dimensionValueNames must not contain duplicate value "${value}".`,
      );
    }
    seen.add(value);
    return value;
  });
}

function requireMatchingDimensionValueName(
  values: readonly string[],
  targetValueName: string,
): string {
  assertNonEmptyText(targetValueName, "postingDimensionValueName");
  if (!values.includes(targetValueName)) {
    throw new Error(
      `postingDimensionValueName "${targetValueName}" must match one of the requested dimension values.`,
    );
  }

  return targetValueName;
}

function pickAccountByNumber(
  accounts: readonly AccountSummary[],
  accountNumber: number,
  label: string,
): AccountSummary {
  const match = pickOptionalAccountByNumber(accounts, accountNumber);
  if (!match?.id) {
    throw new Error(
      `Expected ${label} account ${accountNumber}, but Tripletex did not return it.`,
    );
  }

  return match;
}

function pickOptionalAccountByNumber(
  accounts: readonly AccountSummary[],
  accountNumber: number,
): AccountSummary | undefined {
  return accounts.find(
    (account) => normalizeComparableNumber(account.number) === accountNumber,
  );
}

async function loadFallbackBalancingAccount(
  ctx: StrategyContext,
): Promise<AccountSummary> {
  const response = await ctx.tripletex.get<ListResponse<AccountSummary>>(
    "/ledger/account",
    {
      query: {
        isBankAccount: true,
        fields: "*",
      },
    },
  );
  const candidates = response.values ?? [];
  const ranked = [...candidates].sort(
    (left, right) => scoreBankAccount(right) - scoreBankAccount(left),
  );
  const best = ranked[0];
  if (!best?.id) {
    throw new Error(
      "Tripletex did not return any fallback bank or invoice account.",
    );
  }

  return best;
}

function scoreBankAccount(account: AccountSummary): number {
  const number = normalizeComparableNumber(account.number);
  let score = 0;
  if (account.isInvoiceAccount) {
    score += 4;
  }
  if (account.isBankAccount) {
    score += 3;
  }
  if (typeof number === "number" && String(number).startsWith("19")) {
    score += 2;
  }
  return score;
}

function requireNumber(value: unknown, label: string): number {
  const normalized = normalizeComparableNumber(value);
  if (typeof normalized !== "number") {
    throw new Error(`Tripletex did not return a valid ${label}.`);
  }

  return normalized;
}

function normalizeComparableNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function assertNonEmptyText(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertMaxLength(
  value: string,
  maxLength: number,
  fieldName: string,
): void {
  if (value.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters.`);
  }
}

function assertPositiveNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`);
  }
}
