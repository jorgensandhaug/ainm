const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function url(path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

async function create(payload: Record<string, unknown>) {
  const response = await fetch(url("supplier"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    body,
  };
}

const cases = [
  {
    label: "baseline",
    payload: {
      name: "Supplier Variant Baseline 321000008",
      organizationNumber: "321000008",
      email: "faktura-321000008@example.no",
      invoiceEmail: "faktura-321000008@example.no",
    },
  },
  {
    label: "null-addresses",
    payload: {
      name: "Supplier Variant NullAddr 321000009",
      organizationNumber: "321000009",
      email: "faktura-321000009@example.no",
      invoiceEmail: "faktura-321000009@example.no",
      postalAddress: null,
      physicalAddress: null,
    },
  },
  {
    label: "null-addresses-explicit-defaults",
    payload: {
      name: "Supplier Variant NullAddr Defaults 321000010",
      organizationNumber: "321000010",
      email: "faktura-321000010@example.no",
      invoiceEmail: "faktura-321000010@example.no",
      postalAddress: null,
      physicalAddress: null,
      isCustomer: false,
      isInactive: false,
      showProducts: false,
      language: "NO",
    },
  },
];

const results = [];
for (const testCase of cases) {
  const result = await create(testCase.payload);
  results.push({
    label: testCase.label,
    request: testCase.payload,
    status: result.status,
    value: result.body?.value
      ? {
          id: result.body.value.id,
          name: result.body.value.name,
          organizationNumber: result.body.value.organizationNumber,
          email: result.body.value.email,
          invoiceEmail: result.body.value.invoiceEmail,
          postalAddress: result.body.value.postalAddress ?? null,
          physicalAddress: result.body.value.physicalAddress ?? null,
          deliveryAddress: result.body.value.deliveryAddress ?? null,
          isCustomer: result.body.value.isCustomer,
          isInactive: result.body.value.isInactive,
          showProducts: result.body.value.showProducts,
          language: result.body.value.language,
          displayName: result.body.value.displayName,
        }
      : result.body,
  });
}

console.log(JSON.stringify(results, null, 2));
