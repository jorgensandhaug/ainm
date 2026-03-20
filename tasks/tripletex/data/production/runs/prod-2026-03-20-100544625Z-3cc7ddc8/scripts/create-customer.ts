const BASE_URL = "https://example.invalid/v2";
const SESSION_TOKEN = "dummy";

const payload = {
  name: "Debug Test AS",
  email: "debug@example.no",
  organizationNumber: "999888771",
};

type Customer = {
  id?: number;
  name?: string;
  email?: string;
  organizationNumber?: string;
};

type ResponseWrapperCustomer = {
  value?: Customer;
};

function buildUrl(path: string): string {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

async function main(): Promise<void> {
  const auth = Buffer.from(`0:${SESSION_TOKEN}`).toString("base64");
  const response = await fetch(buildUrl("/customer"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  const body = raw ? (JSON.parse(raw) as ResponseWrapperCustomer) : null;

  if (!response.ok) {
    throw new Error(
      `Tripletex POST /customer failed: ${response.status} ${response.statusText}\n${raw}`,
    );
  }

  const customer = body?.value;
  if (!customer) {
    throw new Error(`Missing response.value in Tripletex response: ${raw}`);
  }

  if (
    customer.name !== payload.name ||
    customer.email !== payload.email ||
    customer.organizationNumber !== payload.organizationNumber
  ) {
    throw new Error(
      `Verification failed from write response: ${JSON.stringify(customer, null, 2)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        id: customer.id ?? null,
        name: customer.name,
        email: customer.email,
        organizationNumber: customer.organizationNumber,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
