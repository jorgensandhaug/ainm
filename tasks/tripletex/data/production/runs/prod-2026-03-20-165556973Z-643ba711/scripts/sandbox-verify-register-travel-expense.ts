const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "REDACTED_TRIPLETEX_SANDBOX_SESSION_TOKEN";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
const runDate = "2026-03-20";
const departureDate = "2026-03-18";
const returnDate = "2026-03-20";
const title = "Codex sandbox Drammen conference verification";
const destination = "Drammen";

function normalize(text: string | undefined | null) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

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
    throw new Error(
      JSON.stringify(
        {
          path,
          status: response.status,
          statusText: response.statusText,
          body,
        },
        null,
        2,
      ),
    );
  }
  return body as T;
}

function pickCostCategory(
  values: Array<{ id: number; description?: string; showOnTravelExpenses?: boolean }>,
  wanted: string,
) {
  const active = values.filter((value) => value.showOnTravelExpenses);
  return (
    active.find((value) => normalize(value.description) === normalize(wanted)) ??
    active.find((value) => normalize(value.description).includes(normalize(wanted)))
  );
}

async function main() {
  const exactEmployeeResp = await api<{
    values: Array<{
      id: number;
      email?: string;
      allowInformationRegistration?: boolean;
      address?: { city?: string };
      displayName?: string;
    }>;
  }>("employee", undefined, {
    email: "bruno.santos@example.org",
    count: "10",
    fields: "*",
  });

  let employee =
    exactEmployeeResp.values.find(
      (value) =>
        normalize(value.email) === "bruno.santos@example.org" &&
        !!value.address?.city &&
        value.allowInformationRegistration,
    ) ??
    exactEmployeeResp.values.find(
      (value) => normalize(value.email) === "bruno.santos@example.org" && !!value.address?.city,
    );

  if (!employee) {
    const employeeResp = await api<{
      values: Array<{
        id: number;
        email?: string;
        allowInformationRegistration?: boolean;
        address?: { city?: string };
        displayName?: string;
      }>;
    }>("employee", undefined, {
      count: "1000",
      fields: "*",
    });

    employee =
      employeeResp.values.find(
        (value) => !!value.address?.city && value.allowInformationRegistration && !!value.email,
      ) ??
      employeeResp.values.find((value) => !!value.address?.city && !!value.email);
  }

  if (!employee?.address?.city) {
    throw new Error("No sandbox employee with email and address.city found");
  }

  const costCategoryResp = await api<{
    values: Array<{ id: number; description?: string; showOnTravelExpenses?: boolean }>;
  }>("travelExpense/costCategory", undefined, {
    count: "1000",
    fields: "*",
  });

  const paymentTypeResp = await api<{
    values: Array<{
      id: number;
      description?: string;
      showOnTravelExpenses?: boolean;
      isInactive?: boolean;
    }>;
  }>("travelExpense/paymentType", undefined, {
    count: "1000",
    fields: "*",
  });

  const rateResp = await api<{
    values: Array<{
      id: number;
      rate?: number;
      rateCategory?: { id?: number; displayName?: string; name?: string };
    }>;
  }>("travelExpense/rate", undefined, {
    type: "PER_DIEM",
    isValidDomestic: "true",
    dateFrom: departureDate,
    dateTo: returnDate,
    count: "1000",
    fields: "*",
  });

  const flightCategory = pickCostCategory(costCategoryResp.values, "Fly");
  const taxiCategory = pickCostCategory(costCategoryResp.values, "Taxi");
  const paymentType =
    paymentTypeResp.values.find(
      (value) => value.showOnTravelExpenses && !value.isInactive && normalize(value.description) === "privat utlegg",
    ) ??
    paymentTypeResp.values.find((value) => value.showOnTravelExpenses && !value.isInactive);
  const rateType = rateResp.values.find((value) => value.rate === 800) ?? rateResp.values[0];

  if (!flightCategory || !taxiCategory || !paymentType || !rateType) {
    throw new Error("Missing category, payment type, or rate type");
  }

  const createResp = await api<{
    value: {
      id: number;
      state?: string;
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
      travelDetails?: {
        departureDate?: string;
        returnDate?: string;
        departureFrom?: string;
        destination?: string;
      };
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
        departureFrom: employee.address.city,
        destination,
        detailedJourneyDescription: title,
        purpose: title,
      },
      perDiemCompensations: [
        {
          location: destination,
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
          comments: "flight ticket",
          amountCurrencyIncVat: 5950,
          amountNOKInclVAT: 5950,
          date: departureDate,
        },
        {
          costCategory: { id: taxiCategory.id },
          paymentType: { id: paymentType.id },
          vatType: { id: 0 },
          comments: "taxi",
          amountCurrencyIncVat: 600,
          amountNOKInclVAT: 600,
          date: returnDate,
        },
      ],
    }),
  });

  const deliverResp = await api<{
    values: Array<{
      id: number;
      state?: string;
      title?: string;
      employee?: { id?: number };
      costs?: Array<{ id?: number }>;
      perDiemCompensations?: Array<{ id?: number }>;
      travelDetails?: {
        departureDate?: string;
        returnDate?: string;
        departureFrom?: string;
        destination?: string;
      };
    }>;
  }>("travelExpense/:deliver", { method: "PUT" }, { id: String(createResp.value.id) });

  const delivered = deliverResp.values.find((value) => value.id === createResp.value.id);
  if (!delivered) {
    throw new Error("Deliver response did not include created travel expense");
  }

  console.log(
    JSON.stringify(
      {
        verifiedOn: runDate,
        employeeId: employee.id,
        employeeEmail: employee.email,
        employeeName: employee.displayName,
        employeeCity: employee.address.city,
        rateTypeId: rateType.id,
        rateTypeRate: rateType.rate,
        createdState: createResp.value.state,
        deliveredId: delivered.id,
        deliveredState: delivered.state,
        deliveredTitle: delivered.title,
        departureDate: delivered.travelDetails?.departureDate,
        returnDate: delivered.travelDetails?.returnDate,
        departureFrom: delivered.travelDetails?.departureFrom,
        destination: delivered.travelDetails?.destination,
        costCount: delivered.costs?.length ?? 0,
        perDiemCount: delivered.perDiemCompensations?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

await main();
