const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type Envelope<T> = {
  value?: T;
  values?: T[];
  validationMessages?: Array<{ message?: string }>;
};

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
};

async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; data: Envelope<T> | null; text: string }> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(`${baseUrl}/${path}`, { ...init, headers });
  const text = await res.text();
  let data: Envelope<T> | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as Envelope<T>;
    } catch {
      data = null;
    }
  }
  return { status: res.status, data, text };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const res = await api<Invoice>("invoice", {
    method: "POST",
    body: JSON.stringify({
      invoiceDate: "2026-03-20",
      invoiceDueDate: "2026-04-03",
      customer: { id: 108285602 },
      orders: [
        {
          customer: { id: 108285602 },
          orderDate: "2026-03-20",
          deliveryDate: "2026-03-20",
          orderLines: [
            {
              description: "Stockage cloud sans vatType probe",
              count: 1,
              unitPriceExcludingVatCurrency: 34100,
            },
          ],
        },
      ],
    }),
  });

  if (res.status < 200 || res.status >= 300 || !res.data?.value) {
    fail(`probe failed: ${res.status} ${res.text}`);
  }

  console.log(JSON.stringify(res.data.value, null, 2));
}

await main();
