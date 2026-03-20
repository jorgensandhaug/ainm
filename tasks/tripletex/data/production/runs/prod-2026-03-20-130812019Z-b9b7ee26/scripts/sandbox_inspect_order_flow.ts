const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type WrappedList<T> = { values: T[]; fullResultSize?: number };

type Customer = {
  id: number;
  displayName?: string;
  name?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  productNumber?: string | number;
  name?: string;
  displayName?: string;
  priceExcludingVatCurrency?: number;
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  debitAccount?: {
    number?: string | number;
    isBankAccount?: boolean;
    isInvoiceAccount?: boolean;
  } | null;
  creditAccount?: { number?: string | number } | null;
  currencyCode?: string;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} -> ${res.status}\n${text}`);
  }
  return (await res.json()) as T;
}

const findPromptProducts = (products: Product[]) =>
  products.filter(
    (p) =>
      String(p.productNumber) === "4430" ||
      String(p.productNumber) === "7773" ||
      p.name === "Informe de análisis" ||
      p.displayName === "Informe de análisis" ||
      p.name === "Sesión de formación" ||
      p.displayName === "Sesión de formación",
  );

async function main() {
  const customerByOrg = await api<WrappedList<Customer>>("/customer?organizationNumber=951612936&fields=*");
  const productsByNumber = await api<WrappedList<Product>>(
    "/product?productNumber=4430&productNumber=7773&fields=*",
  );
  const productsByIds = await api<WrappedList<Product>>("/product?ids=4430,7773&fields=*");
  const productsWide = await api<WrappedList<Product>>("/product?count=1000&fields=*");
  const paymentTypes = await api<WrappedList<PaymentType>>(
    "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );

  const preferredPaymentType =
    paymentTypes.values.find((pt) => {
      const debit = String(pt.debitAccount?.number ?? "");
      return debit.startsWith("19") && (pt.debitAccount?.isBankAccount || pt.debitAccount?.isInvoiceAccount);
    }) ??
    paymentTypes.values.find((pt) => String(pt.debitAccount?.number ?? "").startsWith("19"));

  console.log(
    JSON.stringify(
      {
        customerByOrg,
        productsByNumber,
        productsByIds,
        promptProductsFromWideList: findPromptProducts(productsWide.values ?? []),
        sampleCustomers: customerByOrg.values.slice(0, 3),
        sampleProducts: productsWide.values.slice(0, 10).map((p) => ({
          id: p.id,
          productNumber: p.productNumber,
          name: p.name,
          displayName: p.displayName,
          priceExcludingVatCurrency: p.priceExcludingVatCurrency,
        })),
        paymentTypes: paymentTypes.values.map((pt) => ({
          id: pt.id,
          description: pt.description,
          displayName: pt.displayName,
          debitNumber: pt.debitAccount?.number ?? null,
          debitIsBankAccount: pt.debitAccount?.isBankAccount ?? null,
          debitIsInvoiceAccount: pt.debitAccount?.isInvoiceAccount ?? null,
          creditNumber: pt.creditAccount?.number ?? null,
          currencyCode: pt.currencyCode,
        })),
        preferredPaymentType,
      },
      null,
      2,
    ),
  );
}

await main();
