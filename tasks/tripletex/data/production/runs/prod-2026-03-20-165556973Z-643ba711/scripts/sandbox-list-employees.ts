const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "REDACTED_TRIPLETEX_SANDBOX_SESSION_TOKEN";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

async function main() {
  const url = new URL("employee", `${baseUrl}/`);
  url.searchParams.set("count", "50");
  url.searchParams.set("fields", "*");

  const response = await fetch(url, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, body }, null, 2));
  }

  const values = (body?.values ?? []).map((employee: any) => ({
    id: employee.id,
    email: employee.email,
    displayName: employee.displayName,
    allowInformationRegistration: employee.allowInformationRegistration,
    address: employee.address,
    department: employee.department,
  }));

  console.log(JSON.stringify(values, null, 2));
}

await main();
