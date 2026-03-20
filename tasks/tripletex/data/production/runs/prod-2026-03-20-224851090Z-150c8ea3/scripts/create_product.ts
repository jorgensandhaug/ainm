const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "FsKODv6Iolgu_Frgj3k6Ai6AiLob80FP_SFt9xaW4Ss";
const apiBase = baseUrl.replace(/\/+$/, "");
const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const vatDate = "2026-03-20";

type VatType = {
  id: number;
  percentage?: number;
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (
    response.status === 403 &&
    body?.error === "Invalid or expired token"
  ) {
    throw new Error("Blocked: invalid or expired token");
  }

  if (
    response.status === 403 &&
    body?.error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  ) {
    throw new Error("Blocked: invalid or expired proxy token");
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${JSON.stringify(body)}`,
    );
  }

  return body as T;
}

async function main() {
  const vatResult = await tripletex<{ values?: VatType[] }>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${vatDate}&fields=*`,
  );
  const vatType = vatResult.values?.find((row) => row.percentage === 15);

  if (!vatType?.id) {
    throw new Error("Blocked: no OUTGOING 15% vatType in account");
  }

  const productResult = await tripletex<{ value?: unknown }>("/product", {
    method: "POST",
    body: JSON.stringify({
      name: "Frokostblanding",
      number: 1391,
      priceExcludingVatCurrency: 37450,
      vatType: { id: vatType.id },
    }),
  });

  console.log(JSON.stringify(productResult.value, null, 2));
}

await main();
