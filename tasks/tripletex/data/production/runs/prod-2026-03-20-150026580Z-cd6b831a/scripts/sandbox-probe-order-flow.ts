const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type ListWrapper<T> = { values?: T[]; fullResultSize?: number };

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${path} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function main() {
  const [customers, products, paymentTypes, bankAccounts] = await Promise.all([
    api(`/customer?organizationNumber=864062245&fields=*`) as Promise<ListWrapper<unknown>>,
    api(`/product?productNumber=6749&productNumber=3048&fields=*`) as Promise<ListWrapper<unknown>>,
    api(`/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`) as Promise<ListWrapper<unknown>>,
    api(`/ledger/account?isBankAccount=true&fields=*`) as Promise<ListWrapper<unknown>>,
  ]);

  console.log(
    JSON.stringify(
      {
        customerCount: customers.values?.length ?? 0,
        customers: customers.values ?? [],
        productCount: products.values?.length ?? 0,
        products: products.values ?? [],
        paymentTypeCount: paymentTypes.values?.length ?? 0,
        paymentTypes: paymentTypes.values ?? [],
        bankAccountCount: bankAccounts.values?.length ?? 0,
        bankAccounts: bankAccounts.values ?? [],
      },
      null,
      2,
    ),
  );
}

await main();
