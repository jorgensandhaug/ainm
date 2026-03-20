const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "REDACTED_TRIPLETEX_SANDBOX_SESSION_TOKEN";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
const departureDate = "2026-03-18";
const returnDate = "2026-03-20";
const title = "Codex sandbox DELIVERED Drammen probe";

async function api<T>(
  path: string,
  init?: RequestInit,
  search?: Record<string, string>,
): Promise<T> {
  const url = new URL(path, `${baseUrl}/`);
  if (search) {
    for (const [key, value] of Object.entries(search)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify({ path, status: response.status, body }, null, 2));
  }
  return body as T;
}

function normalize(text: string | undefined | null) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

async function main() {
  const employeeResp = await api<{
    values: Array<{ id: number; email?: string; allowInformationRegistration?: boolean }>;
  }>("employee", undefined, { count: "10", fields: "*" });
  const employee =
    employeeResp.values.find((value) => value.allowInformationRegistration) ?? employeeResp.values[0];
  if (!employee) throw new Error("No employee found");

  const costCategoryResp = await api<{
    values: Array<{ id: number; description?: string; showOnTravelExpenses?: boolean }>;
  }>("travelExpense/costCategory", undefined, { count: "1000", fields: "*" });
  const flightCategory = costCategoryResp.values.find(
    (value) => value.showOnTravelExpenses && normalize(value.description) === "fly",
  );
  const taxiCategory = costCategoryResp.values.find(
    (value) => value.showOnTravelExpenses && normalize(value.description) === "taxi",
  );
  if (!flightCategory || !taxiCategory) throw new Error("Missing categories");

  const paymentTypeResp = await api<{
    values: Array<{
      id: number;
      description?: string;
      showOnTravelExpenses?: boolean;
      isInactive?: boolean;
    }>;
  }>("travelExpense/paymentType", undefined, { count: "1000", fields: "*" });
  const paymentType =
    paymentTypeResp.values.find(
      (value) => value.showOnTravelExpenses && !value.isInactive && normalize(value.description) === "privat utlegg",
    ) ??
    paymentTypeResp.values.find((value) => value.showOnTravelExpenses && !value.isInactive);
  if (!paymentType) throw new Error("Missing payment type");

  const rateResp = await api<{
    values: Array<{ id: number; rate?: number }>;
  }>("travelExpense/rate", undefined, {
    type: "PER_DIEM",
    isValidDomestic: "true",
    dateFrom: departureDate,
    dateTo: returnDate,
    count: "1000",
    fields: "*",
  });
  const rateType = rateResp.values.find((value) => value.rate === 800) ?? rateResp.values[0];
  if (!rateType) throw new Error("Missing rate");

  const createResp = await api<{
    value: {
      id: number;
      state?: string;
      travelDetails?: any;
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
    };
  }>("travelExpense", {
    method: "POST",
    body: JSON.stringify({
      employee: { id: employee.id },
      title,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate,
        returnDate,
        departureFrom: "Oslo",
        destination: "Drammen",
        detailedJourneyDescription: title,
        purpose: title,
      },
      perDiemCompensations: [
        {
          location: "Drammen",
          count: 3,
          rate: 800,
          amount: 2400,
          rateType: { id: rateType.id },
          overnightAccommodation: "HOTEL",
        },
      ],
      costs: [
        {
          costCategory: { id: flightCategory.id },
          paymentType: { id: paymentType.id },
          vatType: { id: 0 },
          comments: "bilhete de avião",
          amountCurrencyIncVat: 5950,
          amountNOKInclVAT: 5950,
          date: departureDate,
        },
        {
          costCategory: { id: taxiCategory.id },
          paymentType: { id: paymentType.id },
          vatType: { id: 0 },
          comments: "táxi",
          amountCurrencyIncVat: 600,
          amountNOKInclVAT: 600,
          date: returnDate,
        },
      ],
    }),
  });

  const deliverResp = await api<{ values: Array<{ id: number; state?: string; travelDetails?: any }> }>(
    "travelExpense/:deliver",
    { method: "PUT" },
    { id: String(createResp.value.id) },
  );

  const costResp = await api<{
    values: Array<{
      comments?: string;
      amountCurrencyIncVat?: number;
      amountNOKInclVAT?: number;
      date?: string;
      vatType?: { id?: number };
    }>;
  }>("travelExpense/cost", undefined, {
    travelExpenseId: String(createResp.value.id),
    count: "20",
    fields: "*",
  });

  const perDiemResp = await api<{
    values: Array<{
      location?: string;
      count?: number;
      rate?: number;
      amount?: number;
      rateType?: { id?: number };
      overnightAccommodation?: string;
    }>;
  }>("travelExpense/perDiemCompensation", undefined, {
    travelExpenseId: String(createResp.value.id),
    count: "20",
    fields: "*",
  });

  const delivered = deliverResp.values.find((value) => value.id === createResp.value.id);
  console.log(
    JSON.stringify(
      {
        id: createResp.value.id,
        createdState: createResp.value.state,
        deliveredState: delivered?.state,
        deliveredTravelDetails: delivered?.travelDetails,
        costs: costResp.values,
        perDiems: perDiemResp.values,
      },
      null,
      2,
    ),
  );
}

await main();
