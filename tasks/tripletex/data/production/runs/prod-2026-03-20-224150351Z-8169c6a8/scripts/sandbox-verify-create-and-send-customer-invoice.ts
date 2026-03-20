const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

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

const makeOrgNumber = () => {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 1000; i += 1) {
    const stem = `999${`${Date.now() + i}`.slice(-5)}`;
    const digits = stem.split("").map(Number);
    let sum = 0;
    for (let j = 0; j < digits.length; j += 1) {
      sum += digits[j] * weights[j];
    }
    const remainder = sum % 11;
    const control = remainder === 0 ? 0 : 11 - remainder;
    if (control < 10) {
      return `${stem}${control}`;
    }
  }
  throw new Error("Unable to generate valid organization number");
};

const main = async () => {
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

  const vatRows = (vatTypes.values ?? []).map((entry: any) => ({
    id: entry.id,
    percentage: entry.percentage,
  }));

  const vat25 = (vatTypes.values ?? []).find(
    (entry: any) => Number(entry.percentage) === 25,
  );
  const vat0 = (vatTypes.values ?? []).find(
    (entry: any) => Number(entry.percentage) === 0,
  );

  const organizationNumber = makeOrgNumber();
  const customerName = `Étoile Reflection ${organizationNumber} SARL`;
  const customer = await request("POST", "customer", {
    name: customerName,
    organizationNumber,
    invoiceSendMethod: "MANUAL",
  });
  const customerId = customer.value?.id;
  if (!customerId) {
    throw new Error("Customer create returned no id");
  }

  const usingVat = vat25 ?? vat0;
  if (!usingVat?.id) {
    throw new Error("No outgoing VAT row available");
  }

  const description = vat25 ? "Rapport d'analyse" : "Rapport d'analyse sandbox no-VAT control";
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
            description,
            count: 1,
            unitPriceExcludingVatCurrency: 7250,
            vatType: { id: usingVat.id },
          },
        ],
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        vatRows,
        exactTaxedBranchAvailable: Boolean(vat25),
        customerId,
        invoiceId: invoice.value?.id,
        invoiceNumber: invoice.value?.invoiceNumber,
        amountExcludingVatCurrency: invoice.value?.amountExcludingVatCurrency,
        amountCurrency: invoice.value?.amountCurrency,
        description,
      },
      null,
      2,
    ),
  );
};

await main();
