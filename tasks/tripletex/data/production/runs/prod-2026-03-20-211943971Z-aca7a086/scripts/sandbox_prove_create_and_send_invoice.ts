const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const CUSTOMER_NAME = "Porto Alegre Lda";
const ORGANIZATION_NUMBER = "842889155";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const DESCRIPTION = "Consultoria de dados";
const AMOUNT_EX_VAT = 11200;

const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type VatType = {
  id: number;
  percentage?: number;
  parentType?: { id?: number };
};

await main();

async function main() {
  const customer = await api("customer", {
    method: "POST",
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: ORGANIZATION_NUMBER,
      invoiceSendMethod: "MANUAL",
    },
  });

  const vatTypeResponse = await api(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const vatTypes: VatType[] = vatTypeResponse.values ?? [];
  const vatType =
    vatTypes.find((value) => Number(value.percentage) === 0 && value.parentType?.id === 0) ??
    vatTypes.find((value) => Number(value.percentage) === 0);

  if (!vatType) {
    throw new Error("No 0% VAT type found");
  }

  const invoice = await api("invoice", {
    method: "POST",
    body: {
      invoiceDate: INVOICE_DATE,
      invoiceDueDate: INVOICE_DUE_DATE,
      customer: { id: customer.value.id },
      orders: [
        {
          customer: { id: customer.value.id },
          orderDate: INVOICE_DATE,
          deliveryDate: INVOICE_DATE,
          orderLines: [
            {
              description: DESCRIPTION,
              count: 1,
              unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
              vatType: { id: vatType.id },
            },
          ],
        },
      ],
    },
  });

  console.log(
    JSON.stringify(
      {
        customerId: customer.value.id,
        vatTypeId: vatType.id,
        vatPercentage: vatType.percentage,
        invoiceId: invoice.value.id,
        invoiceNumber: invoice.value.invoiceNumber,
        amountExcludingVatCurrency: invoice.value.amountExcludingVatCurrency,
        amountCurrency: invoice.value.amountCurrency,
      },
      null,
      2,
    ),
  );
}

async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {
  const url = new URL(path, `${BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`}`);
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${text}`);
  }

  return payload;
}
