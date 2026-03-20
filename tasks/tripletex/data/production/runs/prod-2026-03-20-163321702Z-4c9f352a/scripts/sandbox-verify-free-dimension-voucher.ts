const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const TARGET_ACCOUNT_NUMBER = 6860;
const BALANCING_ACCOUNT_NUMBER = 1920;
const AMOUNT = 47500;
const DATE = "2026-03-20";
const auth = Buffer.from(`0:${SESSION_TOKEN}`).toString("base64");

type Envelope<T> = { value?: T; values?: T[]; [key: string]: unknown };

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

async function api<T>(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const bodyText = await res.text();
  const bodyJson = bodyText ? safeParse(bodyText) : null;

  if (!res.ok) {
    throw new ApiError(res.status, bodyText, bodyJson);
  }

  return bodyJson as T;
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapValue<T>(x: Envelope<T>, label: string): T {
  if (!x?.value) throw new Error(`Missing value in ${label}`);
  return x.value;
}

function unwrapValues<T>(x: Envelope<T>, label: string): T[] {
  if (!Array.isArray(x?.values)) throw new Error(`Missing values in ${label}`);
  return x.values;
}

function validationMessages(bodyJson: any): string[] {
  if (!bodyJson || typeof bodyJson !== "object" || !Array.isArray(bodyJson.validationMessages)) {
    return [];
  }
  return bodyJson.validationMessages.map((entry: any) =>
    [entry?.field, entry?.message].filter(Boolean).join(": "),
  );
}

async function main() {
  const suffix = `${Date.now()}`.slice(-8);
  const dimensionName = `RG${suffix}`.slice(0, 20);
  const valueNames = [`Vest ${suffix.slice(-4)}`, `Midt ${suffix.slice(-4)}`];
  let verificationMode: "created-new-dimension" | "reused-existing-dimension";
  let createBlocker: { status: number; validations: string[]; bodyText: string } | null = null;

  let dimension: { id: number; dimensionIndex: number; dimensionName: string };
  let createdValues: Array<{ id: number; displayName: string; dimensionIndex: number }> = [];
  let linkedValue: { id: number; displayName: string; dimensionIndex: number };

  try {
    dimension = unwrapValue(
      await api<Envelope<{ id: number; dimensionIndex: number; dimensionName: string }>>(
        "/ledger/accountingDimensionName",
        {
          method: "POST",
          body: JSON.stringify({
            dimensionName,
            active: true,
          }),
        },
      ),
      "dimension create",
    );

    for (const displayName of valueNames) {
      const value = unwrapValue(
        await api<Envelope<{ id: number; displayName: string; dimensionIndex: number }>>(
          "/ledger/accountingDimensionValue",
          {
            method: "POST",
            body: JSON.stringify({
              dimensionIndex: dimension.dimensionIndex,
              displayName,
              active: true,
              showInVoucherRegistration: true,
            }),
          },
        ),
        `dimension value create ${displayName}`,
      );
      createdValues.push(value);
    }

    linkedValue = createdValues[1];
    verificationMode = "created-new-dimension";
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;

    const validations = validationMessages(error.bodyJson);
    if (!(error.status === 422 && validations.some((msg) => msg.includes("Maximum of 3 accounting dimensions allowed")))) {
      throw error;
    }

    createBlocker = {
      status: error.status,
      validations,
      bodyText: error.bodyText,
    };

    const existingDimensions = unwrapValues(
      await api<Envelope<{ id: number; dimensionIndex: number; dimensionName: string }>>(
        `/ledger/accountingDimensionName/search?${new URLSearchParams({
          onlyDimensionsWithActiveValues: "true",
          activeOnly: "true",
          fields: "*",
          count: "10",
        }).toString()}`,
      ),
      "dimension search",
    );

    if (existingDimensions.length === 0) {
      throw new Error("Blocked: no reusable active accounting dimension found after max-slot validation");
    }

    dimension = existingDimensions[0];
    const existingValues = unwrapValues(
      await api<Envelope<{ id: number; displayName: string; dimensionIndex: number }>>(
        `/ledger/accountingDimensionValue/search?${new URLSearchParams({
          dimensionIndex: `${dimension.dimensionIndex}`,
          activeOnly: "true",
          showInVoucherRegistration: "true",
          fields: "*",
          count: "100",
        }).toString()}`,
      ),
      "dimension value search",
    );

    if (existingValues.length === 0) {
      throw new Error("Blocked: reusable dimension has no active voucher-visible values");
    }

    createdValues = existingValues.slice(0, 2);
    linkedValue = existingValues[0];
    verificationMode = "reused-existing-dimension";
  }

  const freeDimensionKey = `freeAccountingDimension${dimension.dimensionIndex}`;

  let numberOnlyVoucherError: { status: number; validations: string[]; bodyText: string } | null = null;
  try {
    await api(
      "/ledger/voucher",
      {
        method: "POST",
        body: JSON.stringify({
          date: DATE,
          description: `Shortcut test ${dimensionName}`,
          voucherType: null,
          postings: [
            {
              row: 1,
              date: DATE,
              description: `Shortcut ${dimensionName}`,
              account: { number: TARGET_ACCOUNT_NUMBER },
              currency: { id: 1 },
              amount: AMOUNT,
              amountCurrency: AMOUNT,
              amountGross: AMOUNT,
              amountGrossCurrency: AMOUNT,
              [freeDimensionKey]: { id: linkedValue.id },
            },
            {
              row: 2,
              date: DATE,
              description: `Shortcut ${dimensionName}`,
              account: { number: BALANCING_ACCOUNT_NUMBER },
              currency: { id: 1 },
              amount: -AMOUNT,
              amountCurrency: -AMOUNT,
              amountGross: -AMOUNT,
              amountGrossCurrency: -AMOUNT,
            },
          ],
        }),
      },
    );
  } catch (error) {
    if (error instanceof ApiError) {
      numberOnlyVoucherError = {
        status: error.status,
        validations: validationMessages(error.bodyJson),
        bodyText: error.bodyText,
      };
    } else {
      throw error;
    }
  }

  const accounts = unwrapValues(
    await api<Envelope<{ id: number; number: number; name: string }>>(
      `/ledger/account?${new URLSearchParams({
        number: `${TARGET_ACCOUNT_NUMBER},${BALANCING_ACCOUNT_NUMBER}`,
        fields: "*",
      }).toString()}`,
    ),
    "account lookup",
  );

  const targetAccount = accounts.find((account) => account.number === TARGET_ACCOUNT_NUMBER);
  const balancingAccount = accounts.find((account) => account.number === BALANCING_ACCOUNT_NUMBER);
  if (!targetAccount || !balancingAccount) throw new Error("Missing required accounts");

  const voucher = unwrapValue(
    await api<Envelope<{ id: number; number: number; postings: any[] }>>("/ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: DATE,
        description: `Verified ${dimensionName}`,
        voucherType: null,
        postings: [
          {
            row: 1,
            date: DATE,
            description: `Verified ${dimensionName}`,
            account: { id: targetAccount.id },
            currency: { id: 1 },
            amount: AMOUNT,
            amountCurrency: AMOUNT,
            amountGross: AMOUNT,
            amountGrossCurrency: AMOUNT,
            [freeDimensionKey]: { id: linkedValue.id },
          },
          {
            row: 2,
            date: DATE,
            description: `Verified ${dimensionName}`,
            account: { id: balancingAccount.id },
            currency: { id: 1 },
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

  console.log(
    JSON.stringify(
      {
        dimension,
        createdValues,
        numberOnlyVoucherError,
        createBlocker,
        verificationMode,
        accounts: accounts.map((account) => ({
          id: account.id,
          number: account.number,
          name: account.name,
        })),
        voucher: {
          id: voucher.id,
          number: voucher.number,
          linkedPosting: voucher.postings.find(
            (posting: any) =>
              posting.account?.id === targetAccount.id &&
              posting.amount === AMOUNT &&
              posting[freeDimensionKey]?.id === linkedValue.id,
          ),
        },
      },
      null,
      2,
    ),
  );
}

await main();
