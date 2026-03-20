const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "xJEZylyxgMVDyXcRpQraAhwX2F-7bQh1Vk0EzzEAd-E";

const TODAY = "2026-03-20";
const DIMENSION_NAME = "Region";
const VALUE_NAMES = ["Vestlandet", "Midt-Norge"] as const;
const TARGET_VALUE_NAME = "Vestlandet";
const TARGET_ACCOUNT_NUMBER = 6540;
const BALANCING_ACCOUNT_NUMBER = 1920;
const AMOUNT = 8600;

type TripletexEnvelope<T> = {
  value?: T;
  values?: T[];
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
  source?: string;
};

function buildUrl(path: string, params?: Record<string, string>): string {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<TripletexEnvelope<T>> {
  const response = await fetch(buildUrl(path, params), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as TripletexEnvelope<T>) : {};

  if (
    response.status === 403 &&
    (data.error === "Invalid or expired token" ||
      (data.error ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions." &&
        data.source === "nmiai-proxy"))
  ) {
    throw new Error(`Blocked credentials: ${data.error}`);
  }

  if (!response.ok) {
    const details =
      data.validationMessages?.map((v) => `${v.field ?? "?"}: ${v.message ?? "?"}`).join(" | ") ??
      data.message ??
      data.error ??
      `HTTP ${response.status}`;
    throw new Error(`${method} ${path} failed: ${details}`);
  }

  return data;
}

function expectValue<T>(envelope: TripletexEnvelope<T>, label: string): T {
  if (!envelope.value) {
    throw new Error(`${label}: missing value`);
  }
  return envelope.value;
}

function expectValues<T>(envelope: TripletexEnvelope<T>, label: string): T[] {
  if (!envelope.values) {
    throw new Error(`${label}: missing values`);
  }
  return envelope.values;
}

async function main() {
  const dimension = expectValue(
    await request<{
      id: number;
      dimensionIndex: number;
      dimensionName: string;
      active: boolean;
    }>("POST", "ledger/accountingDimensionName", {
      dimensionName: DIMENSION_NAME,
      active: true,
    }),
    "dimension create",
  );

  const createdValues = [];
  for (const displayName of VALUE_NAMES) {
    const createdValue = expectValue(
      await request<{
        id: number;
        dimensionIndex: number;
        displayName: string;
        active: boolean;
        showInVoucherRegistration: boolean;
      }>("POST", "ledger/accountingDimensionValue", {
        dimensionIndex: dimension.dimensionIndex,
        displayName,
        active: true,
        showInVoucherRegistration: true,
      }),
      `dimension value create ${displayName}`,
    );
    createdValues.push(createdValue);
  }

  const targetValue = createdValues.find((value) => value.displayName === TARGET_VALUE_NAME);
  if (!targetValue) {
    throw new Error(`Target dimension value not created: ${TARGET_VALUE_NAME}`);
  }

  const accounts = expectValues(
    await request<{
      id: number;
      number: number;
      name?: string;
    }>("GET", "ledger/account", undefined, {
      number: `${TARGET_ACCOUNT_NUMBER},${BALANCING_ACCOUNT_NUMBER}`,
      fields: "*",
    }),
    "account lookup",
  );

  const targetAccount = accounts.find((account) => account.number === TARGET_ACCOUNT_NUMBER);
  const balancingAccount = accounts.find((account) => account.number === BALANCING_ACCOUNT_NUMBER);

  if (!targetAccount) {
    throw new Error(`Missing account ${TARGET_ACCOUNT_NUMBER}`);
  }
  if (!balancingAccount) {
    throw new Error(`Missing balancing account ${BALANCING_ACCOUNT_NUMBER}`);
  }

  const dimensionField = `freeAccountingDimension${dimension.dimensionIndex}`;
  const postingWithDimension: Record<string, unknown> = {
    row: 1,
    date: TODAY,
    description: `${DIMENSION_NAME} "${TARGET_VALUE_NAME}"`,
    account: { id: targetAccount.id },
    currency: { id: 1 },
    amount: AMOUNT,
    amountCurrency: AMOUNT,
    amountGross: AMOUNT,
    amountGrossCurrency: AMOUNT,
  };
  postingWithDimension[dimensionField] = { id: targetValue.id };

  const voucher = expectValue(
    await request<{
      id: number;
      number: number;
      postings?: Array<Record<string, unknown>>;
    }>("POST", "ledger/voucher", {
      date: TODAY,
      description: `Beleg Konto ${TARGET_ACCOUNT_NUMBER}, ${DIMENSION_NAME} "${TARGET_VALUE_NAME}"`,
      voucherType: null,
      postings: [
        postingWithDimension,
        {
          row: 2,
          date: TODAY,
          description: `${DIMENSION_NAME} "${TARGET_VALUE_NAME}"`,
          account: { id: balancingAccount.id },
          currency: { id: 1 },
          amount: -AMOUNT,
          amountCurrency: -AMOUNT,
          amountGross: -AMOUNT,
          amountGrossCurrency: -AMOUNT,
        },
      ],
    }),
    "voucher create",
  );

  console.log(
    JSON.stringify(
      {
        dimension,
        createdValues,
        voucher,
      },
      null,
      2,
    ),
  );
}

await main();
