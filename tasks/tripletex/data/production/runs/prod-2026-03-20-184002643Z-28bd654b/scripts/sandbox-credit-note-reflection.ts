const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const TARGET_DESCRIPTION = "Opplæring";
const TARGET_AMOUNT_EX_VAT = 13100;

type ListResponse<T> = {
  values?: T[];
  value?: T;
};

type Customer = {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
};

type LedgerAccount = {
  id: number;
  number?: number | null;
  isInvoiceAccount?: boolean | null;
  bankAccountNumber?: string | null;
};

type InvoiceLine = {
  description?: string | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string | null;
  invoiceDate?: string | null;
  isCreditNote?: boolean | null;
  isCredited?: boolean | null;
  amountExcludingVat?: number | null;
  amountExcludingVatCurrency?: number | null;
  customer?: {
    id?: number | null;
    organizationNumber?: string | null;
  } | null;
  orderLines?: InvoiceLine[] | null;
  orders?: Array<{ orderLines?: InvoiceLine[] | null }> | null;
  creditedInvoice?: number | { id?: number | null } | null;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
const normalizedBaseUrl = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;

function buildUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path, normalizedBaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function tripletex<T>(path: string, init?: RequestInit, query?: Record<string, string>): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${body}`);
  }

  return (await response.json()) as T;
}

function generateNorwegianOrgNumber(): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  while (true) {
    const digits = ["9"];
    for (let i = 0; i < 7; i += 1) {
      digits.push(String(Math.floor(Math.random() * 10)));
    }
    const sum = digits
      .map((digit, index) => Number(digit) * weights[index])
      .reduce((acc, value) => acc + value, 0);
    const remainder = sum % 11;
    const control = 11 - remainder;
    if (control === 10) continue;
    digits.push(String(control === 11 ? 0 : control));
    return digits.join("");
  }
}

function getAmountExVat(invoice: Invoice): number | null {
  if (typeof invoice.amountExcludingVatCurrency === "number") return invoice.amountExcludingVatCurrency;
  if (typeof invoice.amountExcludingVat === "number") return invoice.amountExcludingVat;
  return null;
}

function getCreditedInvoiceId(invoice: Invoice): number | null {
  if (typeof invoice.creditedInvoice === "number") return invoice.creditedInvoice;
  if (invoice.creditedInvoice && typeof invoice.creditedInvoice === "object" && typeof invoice.creditedInvoice.id === "number") {
    return invoice.creditedInvoice.id;
  }
  return null;
}

function getDescriptions(invoice: Invoice): string[] {
  const descriptions = new Set<string>();
  for (const line of invoice.orderLines ?? []) {
    const description = line?.description?.trim();
    if (description) descriptions.add(description);
  }
  for (const order of invoice.orders ?? []) {
    for (const line of order?.orderLines ?? []) {
      const description = line?.description?.trim();
      if (description) descriptions.add(description);
    }
  }
  return [...descriptions];
}

async function ensureInvoiceAccountBankNumber() {
  const accountList = await tripletex<ListResponse<LedgerAccount>>("ledger/account", undefined, {
    isBankAccount: "true",
    fields: "*",
  });
  const account = (accountList.values ?? []).find((value) => value.isInvoiceAccount === true) ?? accountList.values?.[0];
  if (!account || typeof account.id !== "number") {
    throw new Error(`No bank account available for repair: ${JSON.stringify(accountList, null, 2)}`);
  }
  if (account.bankAccountNumber) return account;
  return await tripletex<{ value?: LedgerAccount }>(
    `ledger/account/${account.id}`,
    {
      method: "PUT",
      body: JSON.stringify({ bankAccountNumber: "12345678903" }),
    },
  ).then((result) => result.value ?? account);
}

async function createFixtureInvoice(): Promise<{ invoice: Invoice; organizationNumber: string }> {
  const organizationNumber = generateNorwegianOrgNumber();
  const customerResponse = await tripletex<{ value?: Customer }>("customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Stormberg AS Reflection ${organizationNumber}`,
      email: `sandbox+stormberg-${organizationNumber}@example.com`,
      organizationNumber,
    }),
  });
  const customer = customerResponse.value;
  if (!customer?.id) {
    throw new Error(`Customer create returned no id: ${JSON.stringify(customerResponse, null, 2)}`);
  }

  const vatTypes = await tripletex<ListResponse<VatType>>("ledger/vatType", undefined, {
    typeOfVat: "OUTGOING",
    vatDate: RUN_DATE,
    fields: "*",
  });
  const vatType = (vatTypes.values ?? []).find((value) => value.percentage === 0) ?? vatTypes.values?.[0];
  if (!vatType?.id) {
    throw new Error(`No outgoing VAT type available: ${JSON.stringify(vatTypes, null, 2)}`);
  }

  const createInvoice = async () =>
    tripletex<{ value?: Invoice }>("invoice", {
      method: "POST",
      body: JSON.stringify({
        invoiceDate: RUN_DATE,
        invoiceDueDate: "2026-04-03",
        customer: { id: customer.id },
        orders: [
          {
            customer: { id: customer.id },
            orderDate: RUN_DATE,
            deliveryDate: RUN_DATE,
            orderLines: [
              {
                description: TARGET_DESCRIPTION,
                count: 1,
                unitPriceExcludingVatCurrency: TARGET_AMOUNT_EX_VAT,
                vatType: { id: vatType.id },
              },
            ],
          },
        ],
      }),
    }, { sendToCustomer: "false" });

  try {
    const invoiceResponse = await createInvoice();
    const invoice = invoiceResponse.value;
    if (!invoice?.id) throw new Error(`Invoice create returned no id: ${JSON.stringify(invoiceResponse, null, 2)}`);
    return { invoice, organizationNumber };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("bankkontonummer")) throw error;
    await ensureInvoiceAccountBankNumber();
    const invoiceResponse = await createInvoice();
    const invoice = invoiceResponse.value;
    if (!invoice?.id) throw new Error(`Invoice retry returned no id: ${JSON.stringify(invoiceResponse, null, 2)}`);
    return { invoice, organizationNumber };
  }
}

async function main() {
  const fixture = await createFixtureInvoice();

  const locate = await tripletex<ListResponse<Invoice>>("invoice", undefined, {
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: "2026-03-21",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });

  const candidates = (locate.values ?? []).filter((invoice) => {
    if (invoice.isCreditNote === true || invoice.isCredited === true) return false;
    if (invoice.customer?.organizationNumber !== fixture.organizationNumber) return false;
    if (getAmountExVat(invoice) !== TARGET_AMOUNT_EX_VAT) return false;
    return getDescriptions(invoice).includes(TARGET_DESCRIPTION);
  });

  const uniqueCandidates = [...new Map(candidates.map((invoice) => [invoice.id, invoice])).values()];
  if (uniqueCandidates.length !== 1 || uniqueCandidates[0]?.id !== fixture.invoice.id) {
    throw new Error(
      `Locate proof failed. created=${fixture.invoice.id} candidates=${JSON.stringify(uniqueCandidates, null, 2)}`,
    );
  }

  const creditNoteResponse = await tripletex<{ value?: Invoice }>(
    `invoice/${fixture.invoice.id}/:createCreditNote`,
    { method: "PUT" },
    {
      date: RUN_DATE,
      sendToCustomer: "false",
    },
  );
  const creditNote = creditNoteResponse.value;
  if (!creditNote?.id || creditNote.isCreditNote !== true || getCreditedInvoiceId(creditNote) !== fixture.invoice.id) {
    throw new Error(`Credit-note proof failed: ${JSON.stringify(creditNoteResponse, null, 2)}`);
  }

  console.log(
    JSON.stringify(
      {
        fixtureOrganizationNumber: fixture.organizationNumber,
        fixtureInvoiceId: fixture.invoice.id,
        fixtureInvoiceNumber: fixture.invoice.invoiceNumber ?? null,
        proofLocateCandidates: uniqueCandidates.map((invoice) => invoice.id),
        creditNoteId: creditNote.id,
        creditNoteNumber: creditNote.invoiceNumber ?? null,
        creditedInvoiceId: getCreditedInvoiceId(creditNote),
        isCreditNote: creditNote.isCreditNote,
      },
      null,
      2,
    ),
  );
}

await main();
