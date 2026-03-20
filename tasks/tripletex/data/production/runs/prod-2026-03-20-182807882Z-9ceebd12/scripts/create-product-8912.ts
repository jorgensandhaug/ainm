const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "G5GB6Xk_mnI6AJOBWzN0XnDCHauyDEmaNdZPOsPwwUE";
const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

const headers = {
  Authorization: auth,
  Accept: "application/json",
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}/${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error(JSON.stringify({ path, status: response.status, data }, null, 2));
    process.exit(1);
  }

  return data as T;
}

type ListResponse<T> = {
  values: T[];
  fullResultSize?: number;
};

type VatType = {
  id: number;
  percentage?: number;
  displayName?: string;
  name?: string;
};

type ProductResponse = {
  value: {
    id: number;
    name: string;
    number: string | number;
    priceExcludingVatCurrency?: number;
    vatType?: {
      id: number;
      percentage?: number;
      displayName?: string;
      name?: string;
    };
  };
};

const vatDate = "2026-03-20";

const vatResult = await tripletex<ListResponse<VatType>>(
  `ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(vatDate)}&fields=*`,
);

const vatType = vatResult.values.find((entry) => entry.percentage === 25);

if (!vatType) {
  console.error(
    JSON.stringify(
      {
        error: "Requested 25% OUTGOING VAT type not available",
        vatDate,
        available: vatResult.values.map((entry) => ({
          id: entry.id,
          percentage: entry.percentage,
          name: entry.displayName ?? entry.name,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const payload = {
  name: "Stockage cloud",
  number: "8912",
  priceExcludingVatCurrency: 26850,
  vatType: { id: vatType.id },
};

const product = await tripletex<ProductResponse>("product", {
  method: "POST",
  body: JSON.stringify(payload),
});

console.log(
  JSON.stringify(
    {
      created: product.value,
      usedVatType: {
        id: vatType.id,
        percentage: vatType.percentage,
        name: vatType.displayName ?? vatType.name,
      },
    },
    null,
    2,
  ),
);
