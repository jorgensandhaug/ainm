const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "REDACTED";
const ORG_NO = "859444598";
const CUSTOMER_NAME = "Windmill Ltd";
const TARGET_LINE_DESCRIPTION = "Maintenance";
const TARGET_AMOUNT_EX_VAT = 37550;
const PAYMENT_DATE = "2026-03-19";

const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexListResponse<T> = {
  values: T[];
  fullResultSize?: number;
};

type TripletexValueResponse<T> = {
  value: T;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type OrderLine = {
  description?: string;
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  invoiceDate?: string;
  amount?: number;
  amountExcludingVat?: number;
  amountOutstanding?: number;
  amountOutstandingTotal?: number;
  amountCurrencyOutstanding?: number;
  amountCurrencyOutstandingTotal?: number;
  isCharged?: boolean;
  customer?: Customer;
  orderLines?: OrderLine[];
  currency?: {
    code?: string;
  };
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  currencyCode?: string;
  customer?: { id?: number };
  debitAccount?: { id?: number; number?: number };
  creditAccount?: { id?: number; number?: number };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${path}\n${JSON.stringify(data, null, 2)}`
    );
  }

  return data as T;
}

function exactMaintenanceMatch(invoice: Invoice): boolean {
  if (invoice.amountExcludingVat !== TARGET_AMOUNT_EX_VAT) return false;
  if (!invoice.orderLines?.some((line) => line.description === TARGET_LINE_DESCRIPTION)) {
    return false;
  }
  if (!invoice.customer || invoice.customer.organizationNumber !== ORG_NO) return false;
  return (invoice.amountOutstandingTotal ?? invoice.amountOutstanding ?? 0) > 0;
}

function pickPaymentType(paymentTypes: PaymentType[], currencyCode?: string): PaymentType {
  const compatible = paymentTypes.filter((pt) => {
    if (pt.customer?.id) return false;
    if (currencyCode && pt.currencyCode && pt.currencyCode !== currencyCode) return false;
    return true;
  });

  const ranked = compatible.sort((a, b) => {
    const aScore =
      (a.currencyCode === currencyCode ? 10 : 0) +
      (a.debitAccount?.number ? 1 : 0) +
      (a.creditAccount?.number ? 1 : 0);
    const bScore =
      (b.currencyCode === currencyCode ? 10 : 0) +
      (b.debitAccount?.number ? 1 : 0) +
      (b.creditAccount?.number ? 1 : 0);
    return bScore - aScore || a.id - b.id;
  });

  if (!ranked[0]) {
    throw new Error("No compatible invoice payment type found");
  }

  return ranked[0];
}

async function main() {
  const customerRes = await request<TripletexListResponse<Customer>>(
    `/customer?organizationNumber=${encodeURIComponent(ORG_NO)}&count=10&fields=*`
  );
  const customers = customerRes.values.filter((c) => c.organizationNumber === ORG_NO);

  if (customers.length !== 1) {
    throw new Error(`Expected 1 customer for org no ${ORG_NO}, got ${customers.length}`);
  }

  const customer = customers[0];
  if (customer.name !== CUSTOMER_NAME) {
    throw new Error(`Customer name mismatch: expected "${CUSTOMER_NAME}", got "${customer.name}"`);
  }

  const invoiceRes = await request<TripletexListResponse<Invoice>>(
    `/invoice?customerId=${customer.id}&invoiceDateFrom=2000-01-01&invoiceDateTo=2100-01-01&count=1000&fields=*,customer(*),orderLines(*),currency(*)`
  );

  const candidateInvoices = invoiceRes.values.filter(exactMaintenanceMatch);

  if (candidateInvoices.length !== 1) {
    throw new Error(
      `Expected 1 matching outstanding invoice, got ${candidateInvoices.length}\n${JSON.stringify(candidateInvoices, null, 2)}`
    );
  }

  const invoice = candidateInvoices[0];
  const paidAmount = invoice.amountOutstandingTotal ?? invoice.amountOutstanding;

  if (!paidAmount || paidAmount <= 0) {
    throw new Error(`Invoice ${invoice.id} does not have a positive outstanding amount`);
  }

  const paymentTypeRes = await request<TripletexListResponse<PaymentType>>(
    `/invoice/paymentType?count=1000&fields=*`
  );
  const paymentType = pickPaymentType(paymentTypeRes.values, invoice.currency?.code);

  const paymentRes = await request<TripletexValueResponse<Invoice>>(
    `/invoice/${invoice.id}/:payment?paymentDate=${encodeURIComponent(PAYMENT_DATE)}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(String(paidAmount))}`,
    { method: "PUT" }
  );

  const paidInvoice = paymentRes.value;
  const remaining = paidInvoice.amountOutstandingTotal ?? paidInvoice.amountOutstanding ?? null;

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentDate: PAYMENT_DATE,
        paymentType: {
          id: paymentType.id,
          description: paymentType.description,
          displayName: paymentType.displayName,
        },
        paidAmount,
        remainingOutstanding: remaining,
      },
      null,
      2
    )
  );
}

await main();
