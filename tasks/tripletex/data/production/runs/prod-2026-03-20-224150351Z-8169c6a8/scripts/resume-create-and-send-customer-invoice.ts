const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "hCx_qH9VXK8VJe9182SSUiicbVdEcpjVPZAK1lOo-ss";
const organizationNumber = "995085488";
const invoiceDate = "2026-03-20";
const invoiceDueDate = "2026-04-03";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

const joinUrl = (path: string, search?: URLSearchParams) => {
  const url = new URL(path, `${baseUrl}/`);
  if (search) url.search = search.toString();
  return url.toString();
};

const request = async (
  method: string,
  path: string,
  body?: unknown,
  search?: URLSearchParams,
) => {
  const response = await fetch(joinUrl(path, search), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, body: parsed }, null, 2));
  }
  return parsed as any;
};

const main = async () => {
  const customers = await request(
    "GET",
    "customer",
    undefined,
    new URLSearchParams({ organizationNumber, fields: "*" }),
  );
  const customerId = customers.values?.[0]?.id;
  if (!customerId) {
    throw new Error("Customer not found");
  }

  const vatTypes = await request(
    "GET",
    "ledger/vatType",
    undefined,
    new URLSearchParams({
      typeOfVat: "OUTGOING",
      vatDate: invoiceDate,
      fields: "*",
    }),
  );
  const vatType = (vatTypes.values ?? []).find(
    (entry: any) => Number(entry.percentage) === 25,
  );
  if (!vatType?.id) {
    throw new Error("Outgoing 25% VAT type not available");
  }

  const invoice = await request("POST", "invoice", {
    invoiceDate,
    invoiceDueDate,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: [
          {
            description: "Rapport d'analyse",
            count: 1,
            unitPriceExcludingVatCurrency: 7250,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        customerId,
        invoiceId: invoice.value?.id,
        invoiceNumber: invoice.value?.invoiceNumber,
        amountExcludingVatCurrency: invoice.value?.amountExcludingVatCurrency,
        amountCurrency: invoice.value?.amountCurrency,
      },
      null,
      2,
    ),
  );
};

await main();
