const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const CUSTOMER_ORG_NO = "925760838";
const CUSTOMER_NAME = "Lumière SARL";
const PRODUCT_REFS = ["3644", "4934", "8806"];
const PRODUCT_NAMES = ["Maintenance", "Licence logicielle", "Service réseau"];

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | string[] | number | boolean | undefined>) {
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${BASE_URL.replace(/\/+$/, "")}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function api(path: string, query?: Record<string, string | string[] | number | boolean | undefined>) {
  const response = await fetch(buildUrl(path, query), {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

function simplifyProducts(values: Array<Record<string, unknown>>) {
  return values.map((product) => ({
    id: product.id,
    number: product.number,
    productNumber: product.productNumber,
    name: product.name,
    vatType: product.vatType,
  }));
}

function filterCatalog(values: Array<Record<string, unknown>>) {
  return values.filter((product) => {
    const number = String(product.number ?? "");
    const productNumber = String(product.productNumber ?? "");
    const name = String(product.name ?? "");
    return PRODUCT_REFS.includes(number) || PRODUCT_REFS.includes(productNumber) || PRODUCT_NAMES.includes(name);
  });
}

const customer = await api("/customer", { organizationNumber: CUSTOMER_ORG_NO, fields: "*" });
const productByNumber = await api("/product", { productNumber: PRODUCT_REFS, fields: "*" });
const productByIds = await api("/product", { ids: PRODUCT_REFS.join(","), fields: "*" });
const productCatalog = await api("/product", { count: 1000, fields: "*" });
const vatTypes = await api("/ledger/vatType", { typeOfVat: "OUTGOING", vatDate: "2026-03-20", fields: "*" });

console.log(
  JSON.stringify(
    {
      customerStatus: customer.status,
      customerValues: customer.data?.values?.map((value: Record<string, unknown>) => ({
        id: value.id,
        name: value.name,
        organizationNumber: value.organizationNumber,
      })),
      customerExactNameHit:
        customer.data?.values?.some(
          (value: Record<string, unknown>) =>
            String(value.organizationNumber ?? "") === CUSTOMER_ORG_NO && String(value.name ?? "") === CUSTOMER_NAME,
        ) ?? false,
      productByNumberStatus: productByNumber.status,
      productByNumberValues: simplifyProducts(productByNumber.data?.values ?? []),
      productByIdsStatus: productByIds.status,
      productByIdsValues: simplifyProducts(productByIds.data?.values ?? []),
      productCatalogStatus: productCatalog.status,
      productCatalogMatches: simplifyProducts(filterCatalog(productCatalog.data?.values ?? [])),
      vatTypesStatus: vatTypes.status,
      vatTypesValues: (vatTypes.data?.values ?? []).map((value: Record<string, unknown>) => ({
        id: value.id,
        displayName: value.displayName,
        percentage: value.percentage,
      })),
    },
    null,
    2,
  ),
);
