const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "8C5nI8i4qIhcbrlemn3kxAke6xRVdoGUwiPAI0lPhrw";

const DEPARTMENT_NAME = "Utvikling";
const VOUCHER_DATE = "2026-04-13";
const DESCRIPTION = "Togbillett";
const GROSS_AMOUNT = 11350;
const ATTACHMENT_PATH =
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-21-135921797Z-1519c2a7/attachments/01-kvittering_nb_05.pdf";

const ACCOUNT_CANDIDATES = [1920, 7100, 7130, 7140, 7141, 7149, 7150, 7160, 7170, 7320, 7330];
const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
};

type Department = {
  id?: number;
  name?: string;
};

type VatType = {
  id?: number;
  number?: string | number;
  percentage?: number;
  deductionPercentage?: number;
};

type Account = {
  id?: number;
  number?: string | number;
  name?: string;
  displayName?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  vatLocked?: boolean;
  vatType?: {
    id?: number;
    percentage?: number;
  };
};

type VoucherPosting = {
  row?: number;
  account?: { id?: number };
  department?: { id?: number };
  vatType?: { id?: number };
  amount?: number;
  amountGross?: number;
};

type Voucher = {
  id?: number;
  number?: number;
  description?: string;
  postings?: VoucherPosting[];
  attachment?: { id?: number };
};

class ApiError extends Error {
  status: number;
  body: unknown;
  path: string;

  constructor(path: string, status: number, body: unknown) {
    super(`${path} failed with ${status}`);
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function unwrap<T>(json: ApiEnvelope<T> | T): T | T[] {
  if (json && typeof json === "object") {
    const envelope = json as ApiEnvelope<T>;
    if (envelope.values !== undefined) return envelope.values;
    if (envelope.value !== undefined) return envelope.value;
  }
  return json as T;
}

function extractErrorMessage(body: any) {
  return String(body?.error ?? body?.message ?? body?.developerMessage ?? "");
}

function isInvalidToken(status: number, body: any) {
  if (status !== 403) return false;
  const message = extractErrorMessage(body);
  return (
    message.includes("Invalid or expired token") ||
    message.includes("Invalid or expired proxy token")
  );
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    isForm?: boolean;
  },
): Promise<T> {
  const url = buildUrl(path, options?.query);
  const headers: Record<string, string> = {
    Authorization: auth,
    Accept: "application/json",
  };

  let body: BodyInit | undefined;
  if (options?.body !== undefined) {
    if (options.isForm) {
      body = options.body as BodyInit;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(path, response.status, json);
  }

  return json as T;
}

function requireId(value: unknown, label: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Missing ${label}`);
  }
  return numeric;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined) return [];
  return [value];
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function chooseExpenseAccount(accounts: Account[]) {
  const withoutBank = accounts.filter((account) => Number(account.number) !== 1920);
  const byNumber = new Map(withoutBank.map((account) => [Number(account.number), account]));
  const preferredNumbers = [7140, 7130, 7141, 7149, 7160, 7170, 7100, 7320, 7330];
  for (const number of preferredNumbers) {
    const hit = byNumber.get(number);
    if (hit) return hit;
  }

  const byNameScore = [...withoutBank].sort((a, b) => {
    const score = (account: Account) => {
      const text = normalize(account.displayName || account.name);
      return (
        (/reisekost|reise/.test(text) ? 8 : 0) +
        (/transport/.test(text) ? 6 : 0) +
        (/tog|jernbane|billett/.test(text) ? 5 : 0) +
        (/bilgodtgj|diett|trekkpliktig|oppgavepliktig/.test(text) ? -10 : 0)
      );
    };
    return score(b) - score(a);
  });

  if (byNameScore.length === 0 || normalize(byNameScore[0].displayName || byNameScore[0].name) === "") {
    throw new Error("No suitable travel expense account found");
  }

  return byNameScore[0]!;
}

function chooseIncomingVatType(vatTypes: VatType[]) {
  const deductible = vatTypes.filter(
    (vatType) => Number(vatType.deductionPercentage ?? 100) === 100,
  );
  const pick = (percentage: number) => {
    const matches = deductible.filter((vatType) => Number(vatType.percentage) === percentage);
    matches.sort((a, b) => String(a.number ?? "").localeCompare(String(b.number ?? "")));
    return matches[0];
  };
  return pick(12) ?? pick(25) ?? pick(0) ?? deductible[0];
}

async function resolveDepartment() {
  try {
    const created = await request<ApiEnvelope<Department>>("POST", "department", {
      body: { name: DEPARTMENT_NAME },
    });
    return unwrap<Department>(created) as Department;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (isInvalidToken(error.status, error.body)) throw error;
    if (error.status !== 409) throw error;

    const existing = await request<ApiEnvelope<Department>>("GET", "department", {
      query: { name: DEPARTMENT_NAME, isInactive: false, fields: "*" },
    });
    const exact = asArray(unwrap<Department>(existing)).find(
      (department) => department.name === DEPARTMENT_NAME,
    );
    if (!exact) throw new Error(`Department ${DEPARTMENT_NAME} not found after conflict`);
    return exact;
  }
}

async function main() {
  const department = await resolveDepartment();
  const departmentId = requireId(department.id, "department.id");

  const accountsResponse = await request<ApiEnvelope<Account>>("GET", "ledger/account", {
    query: {
      number: ACCOUNT_CANDIDATES.join(","),
      fields: "*",
    },
  });
  const accounts = asArray(unwrap<Account>(accountsResponse));
  const bankAccount = accounts.find((account) => Number(account.number) === 1920);
  if (!bankAccount) throw new Error("Missing bank account 1920");
  const expenseAccount = chooseExpenseAccount(accounts);
  const bankAccountId = requireId(bankAccount.id, "bank account id");
  const expenseAccountId = requireId(expenseAccount.id, "expense account id");

  let vatTypeId: number | undefined;
  if (!expenseAccount.vatLocked) {
    const vatResponse = await request<ApiEnvelope<VatType>>("GET", "ledger/vatType", {
      query: {
        typeOfVat: "INCOMING",
        vatDate: VOUCHER_DATE,
        fields: "*",
      },
    });
    const vatType = chooseIncomingVatType(asArray(unwrap<VatType>(vatResponse)));
    vatTypeId = requireId(vatType?.id, "vatType.id");
  }

  const voucherResponse = await request<ApiEnvelope<Voucher>>("POST", "ledger/voucher", {
    body: {
      date: VOUCHER_DATE,
      description: DESCRIPTION,
      voucherType: null,
      postings: [
        {
          row: 1,
          date: VOUCHER_DATE,
          description: DESCRIPTION,
          account: { id: expenseAccountId },
          department: { id: departmentId },
          ...(vatTypeId ? { vatType: { id: vatTypeId } } : {}),
          amountGross: GROSS_AMOUNT,
          amountGrossCurrency: GROSS_AMOUNT,
        },
        {
          row: 2,
          date: VOUCHER_DATE,
          description: DESCRIPTION,
          account: { id: bankAccountId },
          amountGross: -GROSS_AMOUNT,
          amountGrossCurrency: -GROSS_AMOUNT,
        },
      ],
    },
  });
  const voucher = unwrap<Voucher>(voucherResponse) as Voucher;
  const voucherId = requireId(voucher.id, "voucher.id");
  const expensePosting = (voucher.postings ?? []).find(
    (posting) => posting.account?.id === expenseAccountId,
  );
  if (!expensePosting) throw new Error("Expense posting missing in voucher response");

  const form = new FormData();
  form.append("file", Bun.file(ATTACHMENT_PATH), "01-kvittering_nb_05.pdf");
  const attachmentResponse = await request<ApiEnvelope<Voucher>>(
    "POST",
    `ledger/voucher/${voucherId}/attachment`,
    { body: form, isForm: true },
  );
  const attachedVoucher = unwrap<Voucher>(attachmentResponse) as Voucher;

  console.log(
    JSON.stringify(
      {
        departmentId,
        expenseAccount: {
          id: expenseAccountId,
          number: Number(expenseAccount.number),
          name: expenseAccount.displayName ?? expenseAccount.name ?? null,
          vatLocked: expenseAccount.vatLocked ?? null,
        },
        bankAccountId,
        vatTypeId: vatTypeId ?? expensePosting.vatType?.id ?? null,
        voucherId,
        voucherNumber: voucher.number ?? null,
        attachmentId: attachedVoucher.attachment?.id ?? null,
        expensePosting: {
          departmentId: expensePosting.department?.id ?? null,
          amount: expensePosting.amount ?? null,
          amountGross: expensePosting.amountGross ?? null,
          vatTypeId: expensePosting.vatType?.id ?? null,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof ApiError) {
    if (isInvalidToken(error.status, error.body)) {
      console.error(
        JSON.stringify(
          {
            blocked: true,
            reason: "invalid_or_expired_token",
            status: error.status,
            body: error.body,
          },
          null,
          2,
        ),
      );
      process.exit(2);
    }

    console.error(
      JSON.stringify(
        {
          blocked: false,
          path: error.path,
          status: error.status,
          body: error.body,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.error(
    JSON.stringify(
      {
        blocked: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
