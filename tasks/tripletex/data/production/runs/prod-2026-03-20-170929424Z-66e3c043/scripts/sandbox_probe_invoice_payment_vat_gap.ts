const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${token}`).toString("base64");

async function main() {
  const url = new URL("invoice", `${baseUrl}/`);
  url.searchParams.set("invoiceDateFrom", "2024-01-01");
  url.searchParams.set("invoiceDateTo", "2027-12-31");
  url.searchParams.set("count", "1000");
  url.searchParams.set("sorting", "-invoiceDate");
  url.searchParams.set("fields", "*,customer(*),orderLines(*),orders(*,orderLines(*))");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(data, null, 2));
  }

  const values = Array.isArray(data?.values) ? data.values : [];
  const interesting = values
    .map((invoice: Record<string, unknown>) => {
      const customer =
        invoice.customer && typeof invoice.customer === "object"
          ? (invoice.customer as Record<string, unknown>)
          : {};
      const outstanding =
        typeof invoice.amountCurrencyOutstanding === "number"
          ? invoice.amountCurrencyOutstanding
          : invoice.amountOutstanding;
      const exVat =
        typeof invoice.amountExcludingVatCurrency === "number"
          ? invoice.amountExcludingVatCurrency
          : invoice.amountExcludingVat;
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orgNumber: customer.organizationNumber ?? null,
        customerName: customer.name ?? null,
        exVat,
        outstanding,
      };
    })
    .filter((invoice) => typeof invoice.id === "number" && typeof invoice.exVat === "number" && typeof invoice.outstanding === "number" && invoice.outstanding > 0 && invoice.outstanding !== invoice.exVat)
    .slice(0, 30);

  console.log(JSON.stringify(interesting, null, 2));
}

await main();
