const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "hCx_qH9VXK8VJe9182SSUiicbVdEcpjVPZAK1lOo-ss";

const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";

const customerInput = {
  name: "Étoile SARL",
  organizationNumber: "995085488",
  invoiceSendMethod: "MANUAL",
};

const lineDescription = "Rapport d'analyse";
const amountExcludingVat = 7250;
const repairBankAccountNumber = "12345678903";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
  message?: string;
  error?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = { id: number };
type VatType = { id: number; percentage?: number };
type LedgerAccount = {
  id: number;
  number?: string;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

const joinUrl = (path: string, search?: URLSearchParams) => {
  const url = new URL(path, `${baseUrl}/`);
  if (search) url.search = search.toString();
  return url.toString();
};

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const isInvalidToken = (body: any) =>
  body?.error === "Invalid or expired token" ||
  body?.error ===
    "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.";

const request = async (
  method: string,
  path: string,
  body?: unknown,
  search?: URLSearchParams,
) => {
  const response = await fetch(joinUrl(path, search), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const parsed = await parseJson(response);

  if (response.status === 403 && isInvalidToken(parsed)) {
    throw new Error(`Blocked credentials: ${JSON.stringify(parsed)}`);
  }

  if (!response.ok) {
    throw Object.assign(
      new Error(`${method} ${path} failed with ${response.status}`),
      { status: response.status, body: parsed },
    );
  }

  return parsed as ApiResponse<any>;
};

const hasMissingBankAccountError = (body: any) => {
  const text = JSON.stringify(body);
  return text.includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
  );
};

const hasDuplicateCustomerError = (body: any) => {
  const text = JSON.stringify(body);
  return (
    text.includes("organizationNumber") &&
    (text.toLowerCase().includes("eksisterer") ||
      text.toLowerCase().includes("already exists") ||
      text.toLowerCase().includes("duplicate"))
  );
};

const findOutgoing25Vat = (vatTypes: VatType[]) => {
  const vat = vatTypes.find((entry) => Number(entry.percentage) === 25);
  if (!vat) {
    throw new Error("Blocked account state: no outgoing 25% VAT type available");
  }
  return vat;
};

const buildInvoicePayload = (customerId: number, vatTypeId: number) => ({
  invoiceDate,
  invoiceDueDate,
  customer: { id: customerId },
  orders: [
    {
      customer: { id: customerId },
      orderDate: invoiceDate,
      deliveryDate: invoiceDate,
      orderLines: [
        {
          description: lineDescription,
          count: 1,
          unitPriceExcludingVatCurrency: amountExcludingVat,
          vatType: { id: vatTypeId },
        },
      ],
    },
  ],
});

const repairInvoiceBankAccount = async () => {
  const accounts = await request(
    "GET",
    "ledger/account",
    undefined,
    new URLSearchParams({ isBankAccount: "true", fields: "*" }),
  );
  const candidates = (accounts.values ?? []) as LedgerAccount[];
  const account =
    candidates.find((entry) => entry.isInvoiceAccount && entry.number === "1920") ??
    candidates.find((entry) => entry.isInvoiceAccount) ??
    candidates.find((entry) => entry.number === "1920") ??
    candidates[0];

  if (!account) {
    throw new Error("No bank ledger account available for repair");
  }

  const bankAccountNumber =
    account.bankAccountNumber && /^\d{11}$/.test(account.bankAccountNumber)
      ? account.bankAccountNumber
      : repairBankAccountNumber;

  await request("PUT", `ledger/account/${account.id}`, { bankAccountNumber });
};

const createOrResolveCustomer = async () => {
  try {
    const customer = await request("POST", "customer", customerInput);
    const customerId = (customer.value as Customer | undefined)?.id;
    if (!customerId) {
      throw new Error("Customer create response missing id");
    }
    return customerId;
  } catch (error: any) {
    if (error?.status !== 422 || !hasDuplicateCustomerError(error.body)) {
      throw error;
    }

    const customer = await request(
      "GET",
      "customer",
      undefined,
      new URLSearchParams({
        organizationNumber: customerInput.organizationNumber,
        fields: "*",
      }),
    );
    const resolvedId = (customer.values?.[0] as Customer | undefined)?.id;
    if (!resolvedId) {
      throw new Error("Existing customer lookup returned no match");
    }
    return resolvedId;
  }
};

const main = async () => {
  const customerId = await createOrResolveCustomer();

  const vatTypes = await request(
    "GET",
    "ledger/vatType",
    undefined,
    new URLSearchParams({
      typeOfVat: "OUTGOING",
      vatDate: invoiceDate,
      fields: "*",
    }),
  );
  const vatType = findOutgoing25Vat((vatTypes.values ?? []) as VatType[]);
  const invoicePayload = buildInvoicePayload(customerId, vatType.id);

  try {
    const invoice = await request("POST", "invoice", invoicePayload);
    console.log(
      JSON.stringify(
        {
          customerId,
          invoiceId: invoice.value?.id,
          invoiceNumber: invoice.value?.invoiceNumber,
          amountExcludingVatCurrency: invoice.value?.amountExcludingVatCurrency,
          amountCurrency: invoice.value?.amountCurrency,
        },
        null,
        2,
      ),
    );
  } catch (error: any) {
    if (error?.status !== 422 || !hasMissingBankAccountError(error.body)) {
      throw error;
    }

    await repairInvoiceBankAccount();
    const invoice = await request("POST", "invoice", invoicePayload);
    console.log(
      JSON.stringify(
        {
          customerId,
          invoiceId: invoice.value?.id,
          invoiceNumber: invoice.value?.invoiceNumber,
          amountExcludingVatCurrency: invoice.value?.amountExcludingVatCurrency,
          amountCurrency: invoice.value?.amountCurrency,
          repairedBankAccount: true,
        },
        null,
        2,
      ),
    );
  }
};

await main();
