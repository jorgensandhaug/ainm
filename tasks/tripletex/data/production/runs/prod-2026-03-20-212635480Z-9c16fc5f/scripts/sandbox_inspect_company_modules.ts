const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const username = process.env.TRIPLETEX_USERNAME ?? "0";
const authHeader = `Basic ${Buffer.from(`${username}:${TOKEN}`).toString("base64")}`;
const moduleToActivate = process.argv[2] ?? null;

async function api(path: string, init?: RequestInit) {
  const url = new URL(path.replace(/^\//, ""), `${BASE_URL}/`);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

const result = {
  username,
  whoAmI: await api("token/session/>whoAmI?fields=*"),
  beforeSalesmodules: await api("company/salesmodules?count=1000&fields=*"),
  activation: moduleToActivate
    ? await api("company/salesmodules", {
        method: "POST",
        body: JSON.stringify({ name: moduleToActivate }),
      })
    : null,
  afterSalesmodules: await api("company/salesmodules?count=1000&fields=*"),
  salarySettings: await api("salary/settings?fields=*"),
  hiddenSpecification: await api("salary/specification?count=1&fields=*"),
};

console.log(JSON.stringify(result, null, 2));
