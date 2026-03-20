const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "uzJWrvS-pq5YsAcXMw90lZ9n9oQmsLvQidLVeLMfRcM";

const DIMENSION_NAME = "Region";
const VALUE_NAMES = ["Vestlandet", "Midt-Norge"] as const;
const TARGET_VALUE_NAME = "Midt-Norge";
const TARGET_ACCOUNT_NUMBER = 6860;
const BALANCING_ACCOUNT_NUMBER = 1920;
const AMOUNT = 47500;
const DATE = "2026-03-20";
const CURRENCY_ID = 1;

const auth = Buffer.from(`0:${SESSION_TOKEN}`).toString("base64");

type ApiEnvelope<T> = { value?: T; values?: T[]; [key: string]: unknown };

class ApiError extends Error {
  status: number;
  bodyText: string;
  bodyJson: any;

  constructor(status: number, bodyText: string, bodyJson: any) {
    super(`HTTP ${status}: ${bodyText}`);
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJsonParse(bodyText) : null;

  if (!response.ok) {
    throw new ApiError(response.status, bodyText, bodyJson);
  }

  return bodyJson as T;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractValidationMessages(bodyJson: any): string[] {
  if (!bodyJson || typeof bodyJson !== "object") return [];
  const msgs = Array.isArray(bodyJson.validationMessages) ? bodyJson.validationMessages : [];
  return msgs
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const field = typeof entry.field === "string" ? entry.field : "";
      const message = typeof entry.message === "string" ? entry.message : "";
      return [field, message].filter(Boolean).join(": ");
    })
    .filter(Boolean);
}

function unwrapValue<T>(envelope: ApiEnvelope<T>, label: string): T {
  if (!envelope || typeof envelope !== "object" || !("value" in envelope) || envelope.value == null) {
    throw new Error(`Missing value in ${label} response`);
  }
  return envelope.value;
}

function unwrapValues<T>(envelope: ApiEnvelope<T>, label: string): T[] {
  if (!envelope || typeof envelope !== "object" || !Array.isArray(envelope.values)) {
    throw new Error(`Missing values in ${label} response`);
  }
  return envelope.values;
}

async function main() {
  if (DIMENSION_NAME.length > 20) {
    throw new Error(`Blocked: dimensionName exceeds 20 chars: ${DIMENSION_NAME}`);
  }

  type DimensionNameResponse = {
    id: number;
    dimensionIndex: number;
    dimensionName: string;
    active: boolean;
  };

  let dimension: DimensionNameResponse;
  try {
    dimension = unwrapValue(
      await api<ApiEnvelope<DimensionNameResponse>>("/ledger/accountingDimensionName", {
        method: "POST",
        body: JSON.stringify({
          dimensionName: DIMENSION_NAME,
          active: true,
        }),
      }),
      "dimension create",
    );
  } catch (error) {
    if (error instanceof ApiError) {
      const validations = extractValidationMessages(error.bodyJson);
      const allText = [error.bodyText, ...validations].join(" | ");
      if (error.status === 403 && error.bodyText.includes("Invalid or expired token")) {
        throw new Error("Blocked: invalid or expired token");
      }
      if (error.status === 422 && allText.includes("Maximum of 3 accounting dimensions allowed")) {
        throw new Error("Blocked: maximum of 3 accounting dimensions allowed");
      }
      if (error.status === 422 && /feature|module/i.test(allText)) {
        throw new Error(`Blocked: accounting dimension feature disabled: ${allText}`);
      }
      throw new Error(`Dimension create failed: ${allText}`);
    }
    throw error;
  }

  type DimensionValueResponse = {
    id: number;
    dimensionIndex: number;
    displayName: string;
    active: boolean;
    showInVoucherRegistration: boolean;
  };

  const createdValues: DimensionValueResponse[] = [];
  for (const displayName of VALUE_NAMES) {
    const value = unwrapValue(
      await api<ApiEnvelope<DimensionValueResponse>>("/ledger/accountingDimensionValue", {
        method: "POST",
        body: JSON.stringify({
          dimensionIndex: dimension.dimensionIndex,
          displayName,
          active: true,
          showInVoucherRegistration: true,
        }),
      }),
      `dimension value create ${displayName}`,
    );
    createdValues.push(value);
  }

  const targetValue = createdValues.find((value) => value.displayName === TARGET_VALUE_NAME);
  if (!targetValue) {
    throw new Error(`Missing created target dimension value: ${TARGET_VALUE_NAME}`);
  }

  type Account = {
    id: number;
    number: number;
    name?: string | null;
    isBankAccount?: boolean | null;
  };

  const accountQuery = new URLSearchParams({
    number: `${TARGET_ACCOUNT_NUMBER},${BALANCING_ACCOUNT_NUMBER}`,
    fields: "*",
  });

  const accounts = unwrapValues(
    await api<ApiEnvelope<Account>>(`/ledger/account?${accountQuery.toString()}`),
    "account lookup",
  );

  const targetAccount = accounts.find((account) => account.number === TARGET_ACCOUNT_NUMBER);
  const balancingAccount = accounts.find((account) => account.number === BALANCING_ACCOUNT_NUMBER);

  if (!targetAccount) {
    throw new Error(`Missing target account ${TARGET_ACCOUNT_NUMBER}`);
  }
  if (!balancingAccount) {
    throw new Error(`Missing balancing account ${BALANCING_ACCOUNT_NUMBER}`);
  }

  const freeDimensionKey = `freeAccountingDimension${dimension.dimensionIndex}`;
  const lineDescription = `${DIMENSION_NAME} "${TARGET_VALUE_NAME}"`;

  type VoucherPosting = {
    row?: number;
    amount?: number;
    amountCurrency?: number;
    amountGross?: number;
    amountGrossCurrency?: number;
    account?: { id?: number; number?: number | null };
    [key: string]: unknown;
  };

  type VoucherResponse = {
    id: number;
    number: number;
    postings?: VoucherPosting[];
  };

  const voucher = unwrapValue(
    await api<ApiEnvelope<VoucherResponse>>("/ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: DATE,
        description: `Bilag conta ${TARGET_ACCOUNT_NUMBER}, ${lineDescription}`,
        voucherType: null,
        postings: [
          {
            row: 1,
            date: DATE,
            description: lineDescription,
            account: { id: targetAccount.id },
            currency: { id: CURRENCY_ID },
            amount: AMOUNT,
            amountCurrency: AMOUNT,
            amountGross: AMOUNT,
            amountGrossCurrency: AMOUNT,
            [freeDimensionKey]: { id: targetValue.id },
          },
          {
            row: 2,
            date: DATE,
            description: lineDescription,
            account: { id: balancingAccount.id },
            currency: { id: CURRENCY_ID },
            amount: -AMOUNT,
            amountCurrency: -AMOUNT,
            amountGross: -AMOUNT,
            amountGrossCurrency: -AMOUNT,
          },
        ],
      }),
    }),
    "voucher create",
  );

  const linkedPosting = (voucher.postings ?? []).find(
    (posting) =>
      posting.account?.id === targetAccount.id &&
      posting.amount === AMOUNT &&
      posting[freeDimensionKey] &&
      typeof posting[freeDimensionKey] === "object" &&
      posting[freeDimensionKey] !== null &&
      (posting[freeDimensionKey] as { id?: number }).id === targetValue.id,
  );

  if (!linkedPosting) {
    throw new Error("Voucher write response missing expected linked posting");
  }

  console.log(
    JSON.stringify(
      {
        dimension: {
          id: dimension.id,
          dimensionIndex: dimension.dimensionIndex,
          dimensionName: dimension.dimensionName,
        },
        values: createdValues.map((value) => ({
          id: value.id,
          dimensionIndex: value.dimensionIndex,
          displayName: value.displayName,
        })),
        voucher: {
          id: voucher.id,
          number: voucher.number,
          linkedPostingAccountId: targetAccount.id,
          linkedDimensionField: freeDimensionKey,
          linkedDimensionValueId: targetValue.id,
          amount: AMOUNT,
        },
      },
      null,
      2,
    ),
  );
}

await main();
