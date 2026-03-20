const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_ID = 18478235;
const DESTINATION = "Bod\u00f8";
const PER_DIEM_DAYS = 3;
const PER_DIEM_RATE = 800;

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type WrappedResponse<T> = {
  value?: T;
};

type Address = {
  city?: string;
  addressLine1?: string;
  displayName?: string;
  addressAsString?: string;
};

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(path, `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function tripletex<T>(
  path: string,
  init?: RequestInit,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }

  return body as T;
}

function firstConcreteLocation(address: Address | null | undefined): string | undefined {
  const candidates = [
    address?.city,
    address?.addressLine1,
    address?.displayName,
    address?.addressAsString,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function normalize(value: string | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function pickByDescription<T extends { id?: number; description?: string; showOnTravelExpenses?: boolean; isInactive?: boolean }>(
  values: T[],
  description: string,
): T {
  const visible = values.filter(
    (value) => value.showOnTravelExpenses === true && value.isInactive !== true,
  );
  const target = normalize(description);
  const exact = visible.find((value) => normalize(value.description) === target);
  if (exact?.id) {
    return exact;
  }
  throw new Error(`Missing lookup row: ${description}`);
}

function pickPaymentType<T extends { id?: number; description?: string; showOnTravelExpenses?: boolean; isInactive?: boolean }>(
  values: T[],
): T {
  const visible = values.filter(
    (value) => value.showOnTravelExpenses === true && value.isInactive !== true,
  );
  const preferred = visible.find((value) => value.description === "Privat utlegg");
  if (preferred?.id) {
    return preferred;
  }
  if (visible[0]?.id) {
    return visible[0];
  }
  throw new Error("Missing payment type");
}

function pickRateType(values: Array<{ id?: number; rate?: number; rateType?: { id?: number } | null; rateTypeId?: number }>) {
  const matching = values.find((value) => Number(value.rate) === PER_DIEM_RATE);
  const chosen = matching ?? values[0];
  const id = Number(chosen?.rateType?.id ?? chosen?.rateTypeId ?? chosen?.id);
  if (!id) {
    throw new Error("Missing rateType");
  }
  return { id };
}

async function main() {
  const employeeResponse = await tripletex<ListResponse<any>>("employee", undefined, {
    id: EMPLOYEE_ID,
    count: 10,
    fields: "*",
  });
  const employee = (employeeResponse.values ?? []).find(
    (value) => Number(value?.id) === EMPLOYEE_ID,
  );
  if (!employee?.id) {
    throw new Error(`Employee not found: ${EMPLOYEE_ID}`);
  }

  const employeeDepartureFrom = firstConcreteLocation(employee.address);
  const companyId = Number(employee.companyId ?? employee.company?.id);
  if (!companyId) {
    throw new Error("Employee missing companyId for fallback probe");
  }

  const companyResponse = await tripletex<WrappedResponse<{ address?: Address | null }>>(
    `company/${companyId}`,
    undefined,
    { fields: "*,address(*)" },
  );
  const companyDepartureFrom = firstConcreteLocation(companyResponse.value?.address);
  if (!companyDepartureFrom) {
    throw new Error("Company fallback did not expose a concrete location");
  }

  const [costCategoryResponse, paymentTypeResponse] = await Promise.all([
    tripletex<ListResponse<any>>("travelExpense/costCategory", undefined, {
      count: 1000,
      fields: "*",
    }),
    tripletex<ListResponse<any>>("travelExpense/paymentType", undefined, {
      count: 1000,
      fields: "*",
    }),
  ]);

  const flightCategory = pickByDescription(costCategoryResponse.values ?? [], "Fly");
  const taxiCategory = pickByDescription(costCategoryResponse.values ?? [], "Taxi");
  const paymentType = pickPaymentType(paymentTypeResponse.values ?? []);

  const probes = [
    {
      title: "Reflection probe Bod\u00f8 A",
      departureDate: "2026-03-18",
      returnDate: "2026-03-20",
      departureFrom: companyDepartureFrom,
    },
    {
      title: "Reflection probe Bod\u00f8 B",
      departureDate: "2026-03-17",
      returnDate: "2026-03-19",
      departureFrom: companyDepartureFrom,
    },
  ];

  const results = [];
  for (const probe of probes) {
    const rateResponse = await tripletex<ListResponse<any>>("travelExpense/rate", undefined, {
      type: "PER_DIEM",
      isValidDomestic: true,
      dateFrom: probe.departureDate,
      dateTo: probe.returnDate,
      count: 1000,
      fields: "*",
    });
    const rateType = pickRateType(rateResponse.values ?? []);

    const created = await tripletex<WrappedResponse<any>>("travelExpense", {
      method: "POST",
      body: JSON.stringify({
        employee: { id: Number(employee.id) },
        title: probe.title,
        travelDetails: {
          isForeignTravel: false,
          isDayTrip: false,
          isCompensationFromRates: true,
          departureDate: probe.departureDate,
          returnDate: probe.returnDate,
          departureFrom: probe.departureFrom,
          destination: DESTINATION,
          detailedJourneyDescription: probe.title,
          purpose: probe.title,
        },
        perDiemCompensations: [
          {
            location: DESTINATION,
            count: PER_DIEM_DAYS,
            rate: PER_DIEM_RATE,
            amount: PER_DIEM_DAYS * PER_DIEM_RATE,
            rateType,
            overnightAccommodation: "HOTEL",
          },
        ],
        costs: [
          {
            costCategory: { id: Number(flightCategory.id) },
            paymentType: { id: Number(paymentType.id) },
            comments: "flight ticket",
            amountCurrencyIncVat: 6200,
            amountNOKInclVAT: 6200,
            date: probe.departureDate,
            vatType: { id: 0 },
          },
          {
            costCategory: { id: Number(taxiCategory.id) },
            paymentType: { id: Number(paymentType.id) },
            comments: "taxi",
            amountCurrencyIncVat: 400,
            amountNOKInclVAT: 400,
            date: probe.returnDate,
            vatType: { id: 0 },
          },
        ],
      }),
    });

    const id = Number(created.value?.id);
    if (!id) {
      throw new Error(`Create response missing id for ${probe.title}`);
    }

    const delivered = await tripletex<ListResponse<any>>(
      "travelExpense/:deliver",
      { method: "PUT" },
      { id },
    );
    const result =
      (delivered.values ?? []).find((value) => Number(value?.id) === id) ??
      delivered.values?.[0];
    if (!result || result.state !== "DELIVERED") {
      throw new Error(`Deliver failed for ${probe.title}`);
    }

    results.push({
      id,
      state: result.state,
      title: result.title,
      employeeEmail: employee.email ?? null,
      employeeId: result.employee?.id,
      employeeAddressPresent: employeeDepartureFrom ?? null,
      companyId,
      companyDepartureFrom,
      departureDate: result.travelDetails?.departureDate,
      returnDate: result.travelDetails?.returnDate,
      departureFrom: result.travelDetails?.departureFrom,
      destination: result.travelDetails?.destination,
      costs: Array.isArray(result.costs) ? result.costs.length : undefined,
      perDiemCompensations: Array.isArray(result.perDiemCompensations)
        ? result.perDiemCompensations.length
        : undefined,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
