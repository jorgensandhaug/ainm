const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "axg4go_eGi3slEZ94Bzw6QEViXbvOazTCy_Sb92zVOc";
const INVOICE_ID = 2147525559;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function main() {
  const url = new URL(`${BASE_URL}/invoice/${INVOICE_ID}`);
  url.searchParams.set(
    "fields",
    "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
  );

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(JSON.stringify({ status: response.status, body }, null, 2));
    process.exit(1);
  }

  const invoice = body?.value ?? {};
  const lines =
    (Array.isArray(invoice?.orderLines) && invoice.orderLines.length > 0
      ? invoice.orderLines
      : invoice?.orders?.[0]?.orderLines) ?? [];

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        customerName: invoice?.customer?.name ?? null,
        organizationNumber: invoice?.customer?.organizationNumber ?? null,
        amountExcludingVatCurrency: invoice?.amountExcludingVatCurrency ?? null,
        amountCurrency: invoice?.amountCurrency ?? null,
        lineCount: lines.length,
        lines: lines.map((line: any) => ({
          productNumber: line?.product?.number ?? null,
          productName: line?.product?.name ?? null,
          description: line?.description ?? null,
          unitPriceExcludingVatCurrency: line?.unitPriceExcludingVatCurrency ?? null,
          amountExcludingVatCurrency: line?.amountExcludingVatCurrency ?? null,
          vatPercentage: line?.vatType?.percentage ?? null,
          vatNumber: line?.vatType?.number ?? null,
          vatName: line?.vatType?.name ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

await main();
