const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "zJ3T80nvI6A06G7EbsQkF4WuYfEnEJjnjkQVzxiu5Fc";

const auth = Buffer.from(`0:${token}`).toString("base64");

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
  source?: string;
};

type DimensionName = {
  id: number;
  dimensionIndex: number;
  dimensionName: string;
  active: boolean;
};

type DimensionValue = {
  id: number;
  displayName: string;
  dimensionIndex: number;
  active: boolean;
  showInVoucherRegistration: boolean;
};

type LedgerAccount = {
  id: number;
  number: number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type VoucherPosting = {
  account?: { id?: number; number?: number };
  amount?: number;
  amountCurrency?: number;
  amountGross?: number;
  amountGrossCurrency?: number;
  freeAccountingDimension1?: { id?: number };
  freeAccountingDimension2?: { id?: number };
  freeAccountingDimension3?: { id?: number };
};

type Voucher = {
  id: number;
  number: number;
  postings?: VoucherPosting[];
};

class BlockedRunError extends Error {}

async function api<T>(method: string, path: string, body?: unknown): Promise<ApiEnvelope<T>> {
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
  const data = text ? (JSON.parse(text) as ApiEnvelope<T>) : {};

  if (!response.ok) {
    const errorText = data.error ?? data.message ?? response.statusText;
    const validationText = (data.validationMessages ?? [])
      .map((msg) => `${msg.field ?? "unknown"}: ${msg.message ?? ""}`.trim())
      .join(" | ");

    if (
      response.status === 403 &&
      (data.error === "Invalid or expired token" ||
        data.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new BlockedRunError(`blocked credentials: ${data.error}`);
    }

    if (
      response.status === 422 &&
      (validationText.includes("Maximum of 3 accounting dimensions allowed") ||
        validationText.includes("Maximum of 3 accounting dimensions allowed."))
    ) {
      throw new BlockedRunError("blocked account state: max free accounting dimensions already used");
    }

    if (
      response.status === 422 &&
      (validationText.toLowerCase().includes("feature") || validationText.toLowerCase().includes("module"))
    ) {
      throw new BlockedRunError(`blocked feature state: ${validationText || errorText}`);
    }

    throw new Error(
      `${method} ${url.toString()} failed ${response.status}: ${errorText}${validationText ? ` | ${validationText}` : ""}`,
    );
  }

  return data;
}

function requireValue<T>(envelope: ApiEnvelope<T>, label: string): T {
  if (!envelope.value) throw new Error(`missing value in ${label} response`);
  return envelope.value;
}

function requireValues<T>(envelope: ApiEnvelope<T>, label: string): T[] {
  if (!envelope.values) throw new Error(`missing values in ${label} response`);
  return envelope.values;
}

function pickDimensionField(index: number): "freeAccountingDimension1" | "freeAccountingDimension2" | "freeAccountingDimension3" {
  if (index === 1) return "freeAccountingDimension1";
  if (index === 2) return "freeAccountingDimension2";
  if (index === 3) return "freeAccountingDimension3";
  throw new BlockedRunError(`blocked account state: unsupported dimensionIndex ${index}`);
}

function pickAccounts(accounts: LedgerAccount[], targetNumber: number): { target: LedgerAccount; offset: LedgerAccount } {
  const target = accounts.find((account) => account.number === targetNumber);
  const offset = accounts.find((account) => account.number === 1920);
  if (!target) throw new Error(`missing ledger account ${targetNumber}`);
  if (!offset) throw new Error("missing ledger account 1920");
  return { target, offset };
}

async function resolveAccounts(targetNumber: number): Promise<{ target: LedgerAccount; offset: LedgerAccount }> {
  const primary = requireValues<LedgerAccount>(
    await api<LedgerAccount>("GET", `ledger/account?number=${targetNumber},1920&fields=*`),
    "ledger account primary lookup",
  );

  const target = primary.find((account) => account.number === targetNumber);
  const offset = primary.find((account) => account.number === 1920);
  if (target && offset) return { target, offset };

  const fallback = requireValues<LedgerAccount>(
    await api<LedgerAccount>("GET", "ledger/account?isBankAccount=true&fields=*"),
    "ledger account fallback lookup",
  );
  if (!target) throw new Error(`missing ledger account ${targetNumber}`);

  const bank =
    fallback.find((account) => account.number === 1920) ??
    fallback.find((account) => account.isInvoiceAccount) ??
    fallback.find((account) => account.isBankAccount);

  if (!bank) throw new Error("missing fallback bank account");
  return { target, offset: bank };
}

async function main() {
  const date = "2026-03-20";
  const amount = 44950;

  const dimension = requireValue<DimensionName>(
    await api<DimensionName>("POST", "ledger/accountingDimensionName", {
      dimensionName: "Marked",
      active: true,
    }),
    "dimension create",
  );

  const privat = requireValue<DimensionValue>(
    await api<DimensionValue>("POST", "ledger/accountingDimensionValue", {
      dimensionIndex: dimension.dimensionIndex,
      displayName: "Privat",
      active: true,
      showInVoucherRegistration: true,
    }),
    "dimension value create Privat",
  );

  const offentlig = requireValue<DimensionValue>(
    await api<DimensionValue>("POST", "ledger/accountingDimensionValue", {
      dimensionIndex: dimension.dimensionIndex,
      displayName: "Offentlig",
      active: true,
      showInVoucherRegistration: true,
    }),
    "dimension value create Offentlig",
  );

  const { target, offset } = await resolveAccounts(6300);
  const dimensionField = pickDimensionField(dimension.dimensionIndex);
  const sharedText = 'Marked "Offentlig"';

  const voucherPayload: Record<string, unknown> = {
    date,
    description: `Beleg Konto 6300, ${sharedText}`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date,
        description: sharedText,
        account: { id: target.id },
        currency: { id: 1 },
        amount,
        amountCurrency: amount,
        amountGross: amount,
        amountGrossCurrency: amount,
        [dimensionField]: { id: offentlig.id },
      },
      {
        row: 2,
        date,
        description: sharedText,
        account: { id: offset.id },
        currency: { id: 1 },
        amount: -amount,
        amountCurrency: -amount,
        amountGross: -amount,
        amountGrossCurrency: -amount,
      },
    ],
  };

  const voucher = requireValue<Voucher>(
    await api<Voucher>("POST", "ledger/voucher", voucherPayload),
    "voucher create",
  );

  const posting = (voucher.postings ?? []).find((entry) => entry.account?.id === target.id && entry.amount === amount);
  if (!posting) throw new Error("voucher response missing target posting");

  const linkedDimensionId =
    posting.freeAccountingDimension1?.id ??
    posting.freeAccountingDimension2?.id ??
    posting.freeAccountingDimension3?.id;

  if (linkedDimensionId !== offentlig.id) {
    throw new Error(`voucher response linked dimension mismatch: expected ${offentlig.id}, got ${linkedDimensionId ?? "null"}`);
  }

  console.log(
    JSON.stringify(
      {
        dimension: {
          id: dimension.id,
          name: dimension.dimensionName,
          index: dimension.dimensionIndex,
        },
        values: [
          { id: privat.id, name: privat.displayName },
          { id: offentlig.id, name: offentlig.displayName },
        ],
        voucher: {
          id: voucher.id,
          number: voucher.number,
          accountId: target.id,
          accountNumber: target.number,
          amount,
          linkedDimensionValueId: linkedDimensionId,
          balancingAccountId: offset.id,
          balancingAccountNumber: offset.number,
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
