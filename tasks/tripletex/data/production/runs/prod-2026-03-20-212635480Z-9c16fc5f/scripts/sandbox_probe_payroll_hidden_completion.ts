const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const YEAR = 2026;
const MONTH = 3;
const EMPLOYEE_ID = 18584102;
const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Link = { id: number; name?: string | null; displayName?: string | null };
type PaymentTypeOut = { id: number; name?: string | null; showWagePayment?: boolean; showWagePeriodTransaction?: boolean };
type WrappedList<T> = { values: T[] };
type WrappedValue<T> = { value: T };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText} ${path}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }
  return body as T;
}

async function maybeApi(path: string, init?: RequestInit) {
  try {
    return await api(path, init);
  } catch (error) {
    return {
      error: (error as Error).message,
      status: (error as { status?: number }).status ?? null,
      body: (error as { body?: unknown }).body ?? null,
    };
  }
}

async function raw(path: string, init?: RequestInit) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json,application/octet-stream",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const allow = response.headers.get("allow");
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, contentType, allow, body };
}

async function maybePdf(path: string) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/octet-stream,application/json",
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok) {
    const bytes = (await response.arrayBuffer()).byteLength;
    return { status: response.status, contentType, bytes };
  }
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw body.
  }
  return { status: response.status, contentType, body };
}

const salaryTypes = await api<WrappedList<Link>>("salary/type?count=1000&fields=*");
const fastlonn = salaryTypes.values.find((value) => value.name === "Fastlønn");
const bonusType = salaryTypes.values.find((value) => value.name === "Bonus");
if (!fastlonn?.id || !bonusType?.id) throw new Error("missing salary types");

const paymentTypes = await api<WrappedList<PaymentTypeOut>>("ledger/paymentTypeOut?count=1000&fields=*");
const wagePaymentType = paymentTypes.values.find(
  (value) => value.showWagePayment === true && value.showWagePeriodTransaction === true,
);
if (!wagePaymentType?.id) throw new Error("missing wage payment type");

function buildPayload(extra: Record<string, unknown> = {}) {
  return {
    date: RUN_DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: RUN_DATE,
    payslips: [
      {
        employee: { id: EMPLOYEE_ID },
        date: RUN_DATE,
        year: YEAR,
        month: MONTH,
        specifications: [
          {
            salaryType: { id: fastlonn.id },
            description: "Fastlønn mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: 50400,
            amount: 50400,
          },
          {
            salaryType: { id: bonusType.id },
            description: "Bonus mars 2026",
            year: YEAR,
            month: MONTH,
            count: 1,
            rate: 7050,
            amount: 7050,
          },
        ],
      },
    ],
    ...extra,
  };
}

async function createAndInspect(label: string, payload: Record<string, unknown>) {
  const created = await maybeApi(
    "salary/transaction?generateTaxDeduction=true",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  if (!("value" in (created as Record<string, unknown>))) {
    return {
      label,
      createError: created,
    };
  }

  const createdValue = created as WrappedValue<{ id: number; version?: number; payslips?: Array<{ id?: number }> }>;

  const transactionId = createdValue.value.id;
  const transaction = await api<WrappedValue<Record<string, unknown>>>(
    `salary/transaction/${transactionId}?fields=*`,
  );
  const payslipId =
    (createdValue.value.payslips ?? []).find((value) => value?.id)?.id ??
    (((transaction.value as { payslips?: Array<{ id?: number }> }).payslips ?? []).find((value) => value?.id)?.id ??
      null);

  const payslip =
    payslipId === null
      ? null
      : await raw(`salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const payslipPdf = payslipId === null ? null : await maybePdf(`salary/payslip/${payslipId}/pdf`);
  const payslipSearch = await maybeApi(
    `salary/payslip?employeeId=${EMPLOYEE_ID}&yearFrom=2026&yearTo=2026&monthFrom=3&monthTo=4&count=50&fields=*`,
  );
  const postings = await maybeApi(
    `ledger/posting?employeeId=${EMPLOYEE_ID}&dateFrom=${RUN_DATE}&dateTo=${RUN_DATE}&type=WAGE&count=50&fields=*`,
  );

  return {
    label,
    transactionId,
    payslipId,
    transaction: transaction.value,
    payslip,
    payslipPdf,
    payslipSearch,
    postings,
  };
}

const baseline = await createAndInspect("baseline", buildPayload());
const hiddenOnPost = await createAndInspect(
  "hidden-on-post",
  buildPayload({
    completed: true,
    paymentDate: RUN_DATE,
    hasBankTransfers: false,
    paymentType: { id: wagePaymentType.id },
    voucherComment: "sandbox hidden completion probe",
    payslipGeneralComment: "hidden completion probe",
  }),
);

const optionsCollection = await raw("salary/transaction", { method: "OPTIONS" });
const putTargetId =
  "transactionId" in (hiddenOnPost as Record<string, unknown>) && typeof hiddenOnPost.transactionId === "number"
    ? hiddenOnPost.transactionId
    : baseline.transactionId;
const putTargetVersion =
  "transaction" in (baseline as Record<string, unknown>)
    ? ((baseline.transaction as { version?: number }).version ?? null)
    : null;
const putPayload = {
  id: putTargetId,
  version: putTargetVersion,
  date: RUN_DATE,
  year: YEAR,
  month: MONTH,
  paySlipsAvailableDate: RUN_DATE,
  completed: true,
  paymentDate: RUN_DATE,
  hasBankTransfers: false,
  paymentType: { id: wagePaymentType.id },
};
const optionsItem = await raw(`salary/transaction/${putTargetId}`, { method: "OPTIONS" });
const putItem = await raw(`salary/transaction/${putTargetId}`, {
  method: "PUT",
  body: JSON.stringify(putPayload),
});
const afterPut = await createAndInspect(
  "post-put-control",
  buildPayload({
    paymentType: { id: wagePaymentType.id },
  }),
);

console.log(
  JSON.stringify(
    {
      wagePaymentType,
      baseline,
      hiddenOnPost,
      optionsCollection,
      optionsItem,
      putPayload,
      putItem,
      afterPut,
    },
    null,
    2,
  ),
);
