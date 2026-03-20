const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";

const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedValue<T> = { value?: T };
type WrappedList<T> = { values?: T[] };

type Customer = {
  id?: number;
  name?: string;
  organizationNumber?: string;
};

type VatType = {
  id?: number;
  name?: string;
  number?: number;
  percentage?: number;
};

type OrderLine = {
  id?: number;
  description?: string;
  amountExcludingVatCurrency?: number;
};

type Order = {
  id?: number;
  orderLines?: OrderLine[];
};

type Invoice = {
  id?: number;
  invoiceNumber?: number;
  invoiceDate?: string;
  customer?: Customer;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  isCreditNote?: boolean;
  isCredited?: boolean;
  creditedInvoice?: number;
  orderLines?: OrderLine[];
  orders?: Order[];
};

type LedgerAccount = {
  id?: number;
  number?: string | number;
  isInvoiceAccount?: boolean;
  isBankAccount?: boolean;
  version?: number;
  name?: string;
  type?: { id?: number };
};

type TripletexError = {
  status?: number;
  message?: string;
  developerMessage?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let parsed: TripletexError | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      // ignore
    }
    const err = new Error(`${res.status} ${res.statusText}\n${text}`) as Error & { parsed?: TripletexError };
    err.parsed = parsed;
    throw err;
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function uniqueDigits(): string {
  const seed = `${Date.now()}`.slice(-6);
  return `999${seed}`;
}

function lineDescriptions(invoice: Invoice): string[] {
  return [
    ...(invoice.orderLines ?? []),
    ...(invoice.orders ?? []).flatMap((order) => order.orderLines ?? []),
  ]
    .map((line) => line.description?.trim())
    .filter((v): v is string => Boolean(v));
}

async function resolveOutgoingVatType(): Promise<VatType> {
  const resp = await api<WrappedList<VatType>>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
  );
  const vat =
    (resp.values ?? []).find((value) => value.percentage === 0) ??
    (resp.values ?? [])[0];
  if (!vat?.id) {
    throw new Error(`Could not resolve outgoing vatType from ${JSON.stringify(resp, null, 2)}`);
  }
  return vat;
}

async function repairBankAccountIfNeeded(error: Error & { parsed?: TripletexError }): Promise<boolean> {
  const message = JSON.stringify(error.parsed ?? {});
  if (!message.includes("bankkontonummer")) {
    return false;
  }

  const accounts = await api<WrappedList<LedgerAccount>>(`/ledger/account?isBankAccount=true&fields=*`);
  const bank =
    (accounts.values ?? []).find((account) => account.isInvoiceAccount || String(account.number) === "1920") ??
    (accounts.values ?? [])[0];
  if (!bank?.id) {
    throw new Error(`Could not resolve bank account for repair from ${JSON.stringify(accounts, null, 2)}`);
  }

  await api<WrappedValue<LedgerAccount>>(`/ledger/account/${bank.id}`, {
    method: "PUT",
    body: JSON.stringify({
      id: bank.id,
      version: bank.version,
      name: bank.name,
      number: bank.number,
      type: bank.type?.id ? { id: bank.type.id } : undefined,
      isBankAccount: bank.isBankAccount,
      isInvoiceAccount: bank.isInvoiceAccount,
      bankAccountNumber: "12345678903",
    }),
  });

  return true;
}

async function main() {
  const suffix = uniqueDigits();
  const customerResp = await api<WrappedValue<Customer>>(`/customer`, {
    method: "POST",
    body: JSON.stringify({
      name: `Credit Note Reflection ${suffix} AS`,
      email: `credit-note-${suffix}@example.no`,
      organizationNumber: suffix,
    }),
  });
  const customer = customerResp.value;
  if (!customer?.id || !customer.organizationNumber) {
    throw new Error(`Customer create response missing fields: ${JSON.stringify(customerResp, null, 2)}`);
  }

  const vatType = await resolveOutgoingVatType();

  const invoicePayload = {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-03",
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            description: "Consultoria de dados",
            count: 1,
            unitPriceExcludingVatCurrency: 12000,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  };

  let invoiceResp: WrappedValue<Invoice> | undefined;
  try {
    invoiceResp = await api<WrappedValue<Invoice>>(`/invoice?sendToCustomer=false`, {
      method: "POST",
      body: JSON.stringify(invoicePayload),
    });
  } catch (error) {
    const err = error as Error & { parsed?: TripletexError };
    const repaired = await repairBankAccountIfNeeded(err);
    if (!repaired) {
      throw err;
    }
    invoiceResp = await api<WrappedValue<Invoice>>(`/invoice?sendToCustomer=false`, {
      method: "POST",
      body: JSON.stringify(invoicePayload),
    });
  }

  const createdInvoice = invoiceResp.value;
  if (!createdInvoice?.id) {
    throw new Error(`Invoice create response missing id: ${JSON.stringify(invoiceResp, null, 2)}`);
  }

  const locateResp = await api<WrappedList<Invoice>>(
    `/invoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&count=1000&sorting=-invoiceDate&fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`,
  );

  const matches = (locateResp.values ?? []).filter((invoice) => {
    return (
      invoice.customer?.organizationNumber === customer.organizationNumber &&
      invoice.isCreditNote !== true &&
      invoice.isCredited !== true &&
      (invoice.amountExcludingVat === 12000 || invoice.amountExcludingVatCurrency === 12000) &&
      lineDescriptions(invoice).includes("Consultoria de dados")
    );
  });

  if (matches.length !== 1 || matches[0]?.id !== createdInvoice.id) {
    throw new Error(`Locate step failed: ${JSON.stringify(matches, null, 2)}`);
  }

  const creditResp = await api<WrappedValue<Invoice>>(
    `/invoice/${createdInvoice.id}/:createCreditNote?date=${TODAY}&sendToCustomer=false`,
    { method: "PUT" },
  );
  const credit = creditResp.value;
  if (!credit?.id || credit.isCreditNote !== true || credit.creditedInvoice !== createdInvoice.id) {
    throw new Error(`Credit note response did not prove success: ${JSON.stringify(creditResp, null, 2)}`);
  }

  console.log(
    JSON.stringify(
      {
        sandboxCustomerId: customer.id,
        sandboxCustomerOrg: customer.organizationNumber,
        createdInvoiceId: createdInvoice.id,
        createdInvoiceNumber: createdInvoice.invoiceNumber,
        locatedInvoiceId: matches[0].id,
        creditNoteId: credit.id,
        creditNoteInvoiceNumber: credit.invoiceNumber,
        creditedInvoice: credit.creditedInvoice,
        responseIsCreditNote: credit.isCreditNote,
      },
      null,
      2,
    ),
  );
}

await main();
