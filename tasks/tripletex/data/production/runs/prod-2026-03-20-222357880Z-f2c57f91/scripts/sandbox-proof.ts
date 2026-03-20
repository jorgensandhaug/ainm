const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${token}`).toString("base64");

type Envelope<T> = {
  value?: T;
  values?: T[];
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type DimensionName = { id: number; dimensionIndex: number; dimensionName: string };
type DimensionValue = { id: number; dimensionIndex: number; displayName: string };
type LedgerAccount = {
  id: number;
  number: number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};
type Voucher = {
  id: number;
  number: number;
  postings?: Array<{
    account?: { id?: number; number?: number };
    amount?: number;
    freeAccountingDimension1?: { id?: number };
    freeAccountingDimension2?: { id?: number };
    freeAccountingDimension3?: { id?: number };
  }>;
};

async function api<T>(method: string, path: string, body?: unknown) {
  const url = new URL(path, `${baseUrl}/`);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Envelope<T>) : ({} as Envelope<T>);
  return { response, data, url: url.toString() };
}

function dimensionField(index: number): "freeAccountingDimension1" | "freeAccountingDimension2" | "freeAccountingDimension3" {
  if (index === 1) return "freeAccountingDimension1";
  if (index === 2) return "freeAccountingDimension2";
  if (index === 3) return "freeAccountingDimension3";
  throw new Error(`unsupported dimensionIndex ${index}`);
}

function requireValue<T>(data: Envelope<T>, label: string): T {
  if (!data.value) throw new Error(`missing value in ${label}`);
  return data.value;
}

function requireValues<T>(data: Envelope<T>, label: string): T[] {
  if (!data.values) throw new Error(`missing values in ${label}`);
  return data.values;
}

async function resolveSandboxDimension(): Promise<{ source: string; dimensionIndex: number; chosenValueId: number }> {
  const suffix = Date.now().toString().slice(-6);
  const dimensionName = `Marked${suffix}`.slice(0, 12);
  const create = await api<DimensionName>("POST", "ledger/accountingDimensionName", {
    dimensionName,
    active: true,
  });

  if (create.response.status === 201) {
    const dimension = requireValue(create.data, "dimension create");
    await api<DimensionValue>("POST", "ledger/accountingDimensionValue", {
      dimensionIndex: dimension.dimensionIndex,
      displayName: "Privat",
      active: true,
      showInVoucherRegistration: true,
    });
    const offentligCreate = await api<DimensionValue>("POST", "ledger/accountingDimensionValue", {
      dimensionIndex: dimension.dimensionIndex,
      displayName: "Offentlig",
      active: true,
      showInVoucherRegistration: true,
    });
    const offentlig = requireValue(offentligCreate.data, "Offentlig create");
    return {
      source: `created ${dimension.dimensionName}`,
      dimensionIndex: dimension.dimensionIndex,
      chosenValueId: offentlig.id,
    };
  }

  const validationText = (create.data.validationMessages ?? [])
    .map((msg) => `${msg.field ?? "unknown"}: ${msg.message ?? ""}`.trim())
    .join(" | ");
  const maxDimensions = validationText.includes("Maximum of 3 accounting dimensions allowed");
  if (!maxDimensions) {
    throw new Error(`dimension create failed ${create.response.status}: ${create.data.error ?? create.data.message ?? validationText}`);
  }

  const dimensionSearch = await api<DimensionName>(
    "GET",
    "ledger/accountingDimensionName/search?activeOnly=true&onlyDimensionsWithActiveValues=true&fields=*",
  );
  const dimensions = requireValues(dimensionSearch.data, "dimension search");
  const dimension = dimensions[0];
  if (!dimension) throw new Error("no reusable active dimension found in sandbox fallback");

  const valueSearch = await api<DimensionValue>(
    "GET",
    `ledger/accountingDimensionValue/search?dimensionIndex=${dimension.dimensionIndex}&activeOnly=true&showInVoucherRegistration=true&fields=*`,
  );
  const values = requireValues(valueSearch.data, "value search");
  const value = values[0];
  if (!value) throw new Error("no reusable active dimension value found in sandbox fallback");

  return {
    source: `reused dimensionIndex ${dimension.dimensionIndex}`,
    dimensionIndex: dimension.dimensionIndex,
    chosenValueId: value.id,
  };
}

async function main() {
  const date = "2026-03-20";
  const amount = 44950;
  const dimension = await resolveSandboxDimension();
  const dimField = dimensionField(dimension.dimensionIndex);

  const numberOnlyAttempt = await api<Voucher>("POST", "ledger/voucher", {
    date,
    description: "sandbox number-only proof",
    voucherType: null,
    postings: [
      {
        row: 1,
        date,
        description: "sandbox number-only proof",
        account: { number: 6300 },
        currency: { id: 1 },
        amount,
        amountCurrency: amount,
        amountGross: amount,
        amountGrossCurrency: amount,
        [dimField]: { id: dimension.chosenValueId },
      },
      {
        row: 2,
        date,
        description: "sandbox number-only proof",
        account: { number: 1920 },
        currency: { id: 1 },
        amount: -amount,
        amountCurrency: -amount,
        amountGross: -amount,
        amountGrossCurrency: -amount,
      },
    ],
  });

  const accountLookup = await api<LedgerAccount>("GET", "ledger/account?number=6300,1920&fields=*");
  if (!accountLookup.response.ok) {
    throw new Error(`account lookup failed ${accountLookup.response.status}`);
  }
  const accounts = requireValues(accountLookup.data, "account lookup");
  const account6300 = accounts.find((account) => account.number === 6300);
  const account1920 =
    accounts.find((account) => account.number === 1920) ??
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => account.isBankAccount);
  if (!account6300 || !account1920) throw new Error("missing sandbox account ids for 6300/1920");

  const idBasedAttempt = await api<Voucher>("POST", "ledger/voucher", {
    date,
    description: "sandbox id-based proof",
    voucherType: null,
    postings: [
      {
        row: 1,
        date,
        description: "sandbox id-based proof",
        account: { id: account6300.id },
        currency: { id: 1 },
        amount,
        amountCurrency: amount,
        amountGross: amount,
        amountGrossCurrency: amount,
        [dimField]: { id: dimension.chosenValueId },
      },
      {
        row: 2,
        date,
        description: "sandbox id-based proof",
        account: { id: account1920.id },
        currency: { id: 1 },
        amount: -amount,
        amountCurrency: -amount,
        amountGross: -amount,
        amountGrossCurrency: -amount,
      },
    ],
  });

  if (!idBasedAttempt.response.ok) {
    const errorText =
      idBasedAttempt.data.error ??
      idBasedAttempt.data.message ??
      JSON.stringify(idBasedAttempt.data.validationMessages ?? []);
    throw new Error(`id-based voucher failed ${idBasedAttempt.response.status}: ${errorText}`);
  }

  const voucher = requireValue(idBasedAttempt.data, "id-based voucher");
  const linkedPosting = (voucher.postings ?? []).find(
    (posting) => posting.account?.id === account6300.id && posting.amount === amount,
  );
  const linkedValueId =
    linkedPosting?.freeAccountingDimension1?.id ??
    linkedPosting?.freeAccountingDimension2?.id ??
    linkedPosting?.freeAccountingDimension3?.id;

  console.log(
    JSON.stringify(
      {
        dimensionSource: dimension.source,
        numberOnlyAttempt: {
          status: numberOnlyAttempt.response.status,
          error: numberOnlyAttempt.data.error ?? null,
          message: numberOnlyAttempt.data.message ?? null,
          validationMessages: numberOnlyAttempt.data.validationMessages ?? [],
        },
        accountLookup: {
          status: accountLookup.response.status,
          account6300Id: account6300.id,
          account1920Id: account1920.id,
        },
        idBasedAttempt: {
          status: idBasedAttempt.response.status,
          voucherId: voucher.id,
          voucherNumber: voucher.number,
          linkedValueId,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
