const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = Buffer.from(`0:${token}`).toString("base64");

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  return { status: response.status, data };
}

const vat = await api("ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*");
if (vat.status !== 200) {
  throw new Error(`VAT lookup failed: ${vat.status} ${JSON.stringify(vat.data)}`);
}

const create = await api("product", {
  method: "POST",
  body: JSON.stringify({
    name: "Sandbox verification Mantenimiento es",
    number: "972660320",
    priceExcludingVatCurrency: 650,
  }),
});
if (create.status !== 201) {
  throw new Error(`Create failed: ${create.status} ${JSON.stringify(create.data)}`);
}

console.log(
  JSON.stringify(
    {
      outgoingVatRows: vat.data?.values?.map((row: any) => ({
        id: row.id,
        number: row.number,
        name: row.name,
        percentage: row.percentage,
      })),
      created: {
        id: create.data?.value?.id,
        number: create.data?.value?.number,
        priceExcludingVatCurrency: create.data?.value?.priceExcludingVatCurrency,
        priceIncludingVatCurrency: create.data?.value?.priceIncludingVatCurrency,
        vatType: create.data?.value?.vatType,
      },
    },
    null,
    2,
  ),
);
