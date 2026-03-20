const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "REDACTED";

const target = {
  name: "Reflection Smoke Test AS",
  email: "post@reflection-smoke.no",
  organizationNumber: "999888777",
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Wrapped<T> = { value: T };
type Listed<T> = { values: T[]; fullResultSize?: number };

type Customer = {
  id: number;
  version?: number;
  name?: string;
  email?: string;
  organizationNumber?: string;
};

async function tripletex<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: auth,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error(
      JSON.stringify(
        {
          status: response.status,
          path,
          body,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  return { status: response.status, body };
}

function ensureMatch(customer: Customer | undefined): Customer {
  if (
    !customer ||
    customer.name !== target.name ||
    customer.email !== target.email ||
    customer.organizationNumber !== target.organizationNumber
  ) {
    console.error(
      JSON.stringify(
        {
          error: "Final customer state mismatch",
          customer,
          expected: target,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  return customer;
}

const search = await tripletex<Listed<Customer>>(
  `/customer?organizationNumber=${encodeURIComponent(target.organizationNumber)}&fields=*`,
);

const existing = search.body.values ?? [];

if (existing.length > 1) {
  console.error(
    JSON.stringify(
      {
        error: "Ambiguous existing customers",
        matches: existing.map((customer) => ({
          id: customer.id,
          name: customer.name,
          email: customer.email,
          organizationNumber: customer.organizationNumber,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (existing.length === 1) {
  const current = existing[0];
  const needsUpdate =
    current.name !== target.name ||
    current.email !== target.email ||
    current.organizationNumber !== target.organizationNumber;

  if (!needsUpdate) {
    console.log(
      JSON.stringify(
        {
          action: "unchanged",
          customer: ensureMatch(current),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const updated = await tripletex<Wrapped<Customer>>(`/customer/${current.id}`, {
    method: "PUT",
    body: JSON.stringify({
      version: current.version,
      name: target.name,
      email: target.email,
      organizationNumber: target.organizationNumber,
    }),
  });

  console.log(
    JSON.stringify(
      {
        action: "updated",
        customer: ensureMatch(updated.body.value),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const created = await tripletex<Wrapped<Customer>>("/customer", {
  method: "POST",
  body: JSON.stringify(target),
});

console.log(
  JSON.stringify(
    {
      action: "created",
      customer: ensureMatch(created.body.value),
    },
    null,
    2,
  ),
);
