const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "6lJ7skQ24IdpBSx2FNsKGCFLKZ4dcZMN9pPO0Fqbh1k";

const today = "2026-03-20";
const customerOrgNo = "970769994";
const wantedProducts = [
  { name: "Nettverksteneste", ref: "3237", price: 13450 },
  { name: "Analyserapport", ref: "4609", price: 14200 },
];

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
  message?: string;
  error?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = {
  id: number;
  organizationNumber?: string;
  name?: string;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  productNumber?: string | number;
};

type PaymentType = {
  id: number;
  name?: string;
  debitAccount?: {
    id?: number;
    number?: string | number;
    isBankAccount?: boolean;
    isInvoiceAccount?: boolean;
    bankAccountNumber?: string | null;
  };
  creditAccount?: {
    id?: number;
    number?: string | number;
  };
};

type Order = {
  id: number;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
};

type LedgerAccount = {
  id: number;
  number?: string | number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string | null;
};

class HttpError extends Error {
  status: number;
  body: string;
  parsed: any;

  constructor(status: number, body: string, parsed: any) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
    this.parsed = parsed;
  }
}

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

function endpoint(pathAndQuery: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${pathAndQuery}`;
}

async function request<T>(
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const res = await fetch(endpoint(pathAndQuery), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const body = await res.text();
  let parsed: any = {};
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body };
    }
  }

  if (
    res.status === 403 &&
    (parsed?.error === "Invalid or expired token" ||
      parsed?.error ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  ) {
    throw new Error(parsed.error);
  }

  if (!res.ok) {
    throw new HttpError(res.status, body, parsed);
  }

  return parsed as ApiEnvelope<T>;
}

function exactCustomerMatch(values: Customer[] | undefined): Customer | undefined {
  return values?.find((customer) => customer.organizationNumber === customerOrgNo);
}

function normalizedProductRef(product: Product): string {
  return String(product.productNumber ?? product.number ?? "");
}

function resolveProducts(values: Product[] | undefined): Map<string, Product> {
  const byRef = new Map<string, Product>();
  for (const product of values ?? []) {
    const ref = normalizedProductRef(product);
    if (ref) byRef.set(ref, product);
  }
  return byRef;
}

function choosePaymentType(values: PaymentType[] | undefined): PaymentType | undefined {
  const all = values ?? [];
  return (
    all.find(
      (paymentType) =>
        paymentType.debitAccount?.isBankAccount === true &&
        String(paymentType.debitAccount?.number ?? "") === "1920",
    ) ??
    all.find((paymentType) => paymentType.debitAccount?.isBankAccount === true) ??
    all[0]
  );
}

function chooseInvoiceBankAccount(values: LedgerAccount[] | undefined): LedgerAccount | undefined {
  const all = values ?? [];
  return (
    all.find(
      (account) =>
        account.isBankAccount === true &&
        (account.isInvoiceAccount === true || String(account.number ?? "") === "1920"),
    ) ?? all.find((account) => account.isBankAccount === true)
  );
}

function outstandingAmount(invoice: Invoice): number {
  const value = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  return typeof value === "number" ? value : Number.NaN;
}

function validationDetails(err: HttpError): string {
  const details = err.parsed?.validationMessages;
  if (!Array.isArray(details) || details.length === 0) return "";
  return details
    .map((item: any) => item?.message)
    .filter(Boolean)
    .join(" | ");
}

async function main() {
  const customerRes = await request<Customer>(
    `customer?organizationNumber=${encodeURIComponent(customerOrgNo)}&fields=*`,
  );
  const customer = exactCustomerMatch(customerRes.values);
  if (!customer?.id) {
    throw new Error(`Customer not found: ${customerOrgNo}`);
  }

  const productParams = wantedProducts
    .map((product) => `productNumber=${encodeURIComponent(product.ref)}`)
    .join("&");
  let productRes = await request<Product>(`product?${productParams}&fields=*`);
  let productMap = resolveProducts(productRes.values);

  if (wantedProducts.some((product) => !productMap.has(product.ref))) {
    const idsParams = wantedProducts.map((product) => product.ref).join(",");
    productRes = await request<Product>(`product?ids=${encodeURIComponent(idsParams)}&fields=*`);
    productMap = resolveProducts(productRes.values);
  }

  if (wantedProducts.some((product) => !productMap.has(product.ref))) {
    const fallbackRes = await request<Product>("product?count=1000&fields=*");
    const allProducts = fallbackRes.values ?? [];
    productMap = new Map(
      wantedProducts.map((wanted) => {
        const match = allProducts.find(
          (product) =>
            normalizedProductRef(product) === wanted.ref &&
            product.name === wanted.name,
        );
        return [wanted.ref, match as Product];
      }),
    );
  }

  for (const wanted of wantedProducts) {
    const product = productMap.get(wanted.ref);
    if (!product?.id) {
      throw new Error(`Product not found: ${wanted.name} (${wanted.ref})`);
    }
  }

  const paymentTypesRes = await request<PaymentType>(
    "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentType = choosePaymentType(paymentTypesRes.values);
  if (!paymentType?.id) {
    throw new Error("No usable payment type found");
  }

  const orderRes = await request<Order>("order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.id },
      orderDate: today,
      deliveryDate: today,
      orderLines: wantedProducts.map((wanted) => ({
        product: { id: productMap.get(wanted.ref)!.id },
        description: wanted.name,
        count: 1,
        unitPriceExcludingVatCurrency: wanted.price,
      })),
    }),
  });
  const order = orderRes.value;
  if (!order?.id) {
    throw new Error("Order creation did not return an id");
  }

  const invoicePath =
    `order/${order.id}/:invoice?invoiceDate=${today}` +
    `&sendToCustomer=false&paymentTypeId=${paymentType.id}` +
    `&paidAmount=0.01&paymentTypeIdRestAmount=${paymentType.id}`;

  let invoiceRes: ApiEnvelope<Invoice>;
  try {
    invoiceRes = await request<Invoice>(invoicePath, { method: "PUT" });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;

    const detailText = `${error.parsed?.message ?? ""} ${validationDetails(error)}`;
    if (
      error.status === 422 &&
      detailText.includes(
        "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
      )
    ) {
      const accountsRes = await request<LedgerAccount>(
        "ledger/account?isBankAccount=true&fields=*",
      );
      const bankAccount = chooseInvoiceBankAccount(accountsRes.values);
      if (!bankAccount?.id) {
        throw new Error("Bank account repair needed, but no bank account found");
      }

      await request<LedgerAccount>(`ledger/account/${bankAccount.id}`, {
        method: "PUT",
        body: JSON.stringify({
          bankAccountNumber: "12345678903",
        }),
      });

      invoiceRes = await request<Invoice>(invoicePath, { method: "PUT" });
    } else {
      throw error;
    }
  }

  const invoice = invoiceRes.value;
  if (!invoice?.id) {
    throw new Error("Invoice write did not return an id");
  }

  const outstanding = outstandingAmount(invoice);
  if (!Number.isFinite(outstanding) || outstanding !== 0) {
    throw new Error(
      `Invoice not fully paid. invoiceId=${invoice.id} outstanding=${String(outstanding)}`,
    );
  }

  console.log(
    JSON.stringify({
      ok: true,
      customerId: customer.id,
      orderId: order.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? null,
      outstanding,
    }),
  );
}

main().catch((error) => {
  if (error instanceof HttpError) {
    console.error(
      JSON.stringify({
        ok: false,
        status: error.status,
        body: error.parsed && Object.keys(error.parsed).length > 0 ? error.parsed : error.body,
      }),
    );
  } else {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  process.exit(1);
});
