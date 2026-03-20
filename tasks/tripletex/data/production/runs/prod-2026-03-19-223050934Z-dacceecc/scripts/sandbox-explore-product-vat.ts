const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

async function tripletex<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET ${path} failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

async function main() {
  const [allVat, outgoingVat, projectVat, incomingVat, ledgerVat, products] = await Promise.all([
    tripletex("/ledger/vatType?fields=*"),
    tripletex("/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*"),
    tripletex("/ledger/vatType?typeOfVat=PROJECT&vatDate=2026-03-19&fields=*"),
    tripletex("/ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-19&fields=*"),
    tripletex("/ledger/vatType?typeOfVat=LEDGER&vatDate=2026-03-19&fields=*"),
    tripletex("/product?count=10&fields=*"),
  ]);

  console.log(
    JSON.stringify(
      {
        allVat,
        outgoingVat,
        projectVat,
        incomingVat,
        ledgerVat,
        products,
      },
      null,
      2
    )
  );
}

await main();
