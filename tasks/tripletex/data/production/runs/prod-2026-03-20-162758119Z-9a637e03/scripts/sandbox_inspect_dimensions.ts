const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type ApiResponse<T> = {
  value?: T;
  values?: T[];
};

type AccountingDimensionName = {
  id: number;
  dimensionIndex: number;
  dimensionName: string;
  active: boolean;
};

type AccountingDimensionValue = {
  id: number;
  dimensionIndex: number;
  displayName: string;
  active: boolean;
  showInVoucherRegistration: boolean;
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function request<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    console.error(JSON.stringify({ path, status: response.status, body: data }, null, 2));
    process.exit(1);
  }
  return data as ApiResponse<T>;
}

function expectValues<T>(data: ApiResponse<T>, label: string): T[] {
  if (!Array.isArray(data.values)) throw new Error(`Missing values in ${label}`);
  return data.values;
}

async function main() {
  const dimensions = expectValues(
    await request<AccountingDimensionName>(
      "/ledger/accountingDimensionName?fields=*&count=1000",
    ),
    "dimension list",
  );

  const valuesByIndex: Record<number, AccountingDimensionValue[]> = {};
  for (const dimension of dimensions) {
    valuesByIndex[dimension.dimensionIndex] = expectValues(
      await request<AccountingDimensionValue>(
        `/ledger/accountingDimensionValue/search?dimensionIndex=${dimension.dimensionIndex}&fields=*&count=1000`,
      ),
      `dimension values ${dimension.dimensionIndex}`,
    );
  }

  console.log(JSON.stringify({ dimensions, valuesByIndex }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
