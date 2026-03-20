const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "qWHzuDqJzQvdGbML6uCutXz3sbyZGfysK02nLW6frqc";

const authHeader = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type TripletexListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValueResponse<T> = {
  value?: T;
};

type VatType = {
  id: number;
  number?: string | number;
  displayName?: string;
  name?: string;
  percentage?: number;
};

type Product = {
  id: number;
  name: string;
  number: string;
  priceExcludingVatCurrency: number;
  priceIncludingVatCurrency?: number;
  vatType?: {
    id: number;
    percentage?: number;
    number?: string | number;
    displayName?: string;
  };
};

async function tripletexFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    console.error(JSON.stringify({
      path,
      status: response.status,
      data,
    }, null, 2));
    process.exit(1);
  }

  return data as T;
}

const vatLookupPath =
  "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*";

const vatResponse = await tripletexFetch<TripletexListResponse<VatType>>(vatLookupPath, {
  method: "GET",
});

const vatTypes = vatResponse.values ?? [];
const zeroVat = vatTypes.find((vat) => Number(vat.percentage) === 0);

if (!zeroVat) {
  console.error(JSON.stringify({
    error: "No 0% outgoing VAT type available for product creation",
    vatLookupPath,
    vatTypes,
  }, null, 2));
  process.exit(1);
}

const createPayload = {
  name: "Fachbuch",
  number: "2237",
  priceExcludingVatCurrency: 5650,
  vatType: { id: zeroVat.id },
};

const productResponse = await tripletexFetch<TripletexValueResponse<Product>>("/product", {
  method: "POST",
  body: JSON.stringify(createPayload),
});

console.log(JSON.stringify({
  created: productResponse.value,
  usedVatType: zeroVat,
}, null, 2));
