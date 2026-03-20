const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type Customer = {
  id?: number;
  name?: string;
  email?: string;
  organizationNumber?: string;
  invoiceSendMethod?: string;
  emailAttachmentType?: string;
};

type ResponseWrapperCustomer = {
  value?: Customer;
};

type ListResponseCustomer = {
  values?: Customer[];
  fullResultSize?: number;
};

function buildUrl(path: string): string {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function checksumDigit(firstEightDigits: string): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = firstEightDigits
    .split("")
    .map((digit, index) => Number(digit) * weights[index]!)
    .reduce((a, b) => a + b, 0);
  const remainder = sum % 11;
  const control = 11 - remainder;
  if (control === 11) {
    return "0";
  }
  if (control === 10) {
    throw new Error(`Invalid prefix for org number checksum: ${firstEightDigits}`);
  }
  return String(control);
}

function generateValidOrgNumber(): string {
  const start = Date.now() % 100000;
  for (let offset = 0; offset < 100000; offset += 1) {
    const seed = String((start + offset) % 100000).padStart(5, "0");
    const firstEight = `999${seed}`;
    try {
      return `${firstEight}${checksumDigit(firstEight)}`;
    } catch {
      continue;
    }
  }
  throw new Error("Unable to generate valid org number");
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${raw}`);
  }
  return (raw ? JSON.parse(raw) : null) as T;
}

async function main(): Promise<void> {
  const exactPayload = {
    name: "Debug Test AS",
    email: "debug@example.no",
    organizationNumber: "999888771",
  };

  const lookupUrl = buildUrl(
    `/customer?organizationNumber=${encodeURIComponent(
      exactPayload.organizationNumber,
    )}&fields=*`,
  );
  const lookup = await requestJson<ListResponseCustomer>(lookupUrl, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });

  const exactExists = (lookup.values ?? []).some(
    (customer) => customer.organizationNumber === exactPayload.organizationNumber,
  );

  const payload = exactExists
    ? {
        name: `${exactPayload.name} Sandbox`,
        email: `debug+${Date.now()}@example.no`,
        organizationNumber: generateValidOrgNumber(),
      }
    : exactPayload;

  const created = await requestJson<ResponseWrapperCustomer>(buildUrl("/customer"), {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const customer = created.value;
  if (!customer) {
    throw new Error(`Missing response.value: ${JSON.stringify(created)}`);
  }

  if (
    customer.name !== payload.name ||
    customer.email !== payload.email ||
    customer.organizationNumber !== payload.organizationNumber
  ) {
    throw new Error(
      `Write response did not prove requested fields: ${JSON.stringify(customer, null, 2)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        usedExactPromptPayload: !exactExists,
        id: customer.id ?? null,
        name: customer.name,
        email: customer.email,
        organizationNumber: customer.organizationNumber,
        invoiceSendMethod: customer.invoiceSendMethod ?? null,
        emailAttachmentType: customer.emailAttachmentType ?? null,
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
