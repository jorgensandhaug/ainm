const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const EMPLOYEE_ID = 18478235;
const COMPANY_ID = 108114337;

const auth = Buffer.from(`0:${TOKEN}`).toString("base64");

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type WrappedResponse<T> = {
  value?: T;
};

type Variant = {
  key: string;
  departureDate: string;
  returnDate: string;
  departureFrom: string;
};

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
) {
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

async function api<T>(
  path: string,
  init?: RequestInit,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          path,
          query,
          status: response.status,
          body: data,
        },
        null,
        2,
      ),
    );
  }
  return data as T;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

function pickCostCategory(values: any[], description: string) {
  const active = values.filter((value) => value?.showOnTravelExpenses === true);
  const exact = active.find(
    (value) => normalize(String(value?.description ?? "")) === normalize(description),
  );
  if (!exact) throw new Error(`Missing cost category ${description}`);
  return exact;
}

function pickPaymentType(values: any[]) {
  const active = values.filter(
    (value) => value?.showOnTravelExpenses === true && value?.isInactive !== true,
  );
  const preferred = active.find((value) => String(value?.description ?? "") === "Privat utlegg");
  if (!preferred && !active[0]) throw new Error("Missing travel payment type");
  return preferred ?? active[0];
}

function pickRateType(values: any[]) {
  const exact = values.find((value) => Number(value?.rate) === 800);
  const chosen = exact ?? values[0];
  const id = chosen?.rateType?.id ?? chosen?.rateTypeId ?? chosen?.id;
  if (!id) throw new Error("Missing rate type id");
  return { id: Number(id), rate: Number(chosen?.rate ?? 0) };
}

async function createAndDeliver(
  variant: Variant,
  refs: {
    flightCategoryId: number;
    taxiCategoryId: number;
    paymentTypeId: number;
    rateTypeId: number;
  },
) {
  const title = `Reflection probe ${variant.key} Bergen`;

  const created = await api<WrappedResponse<any>>("travelExpense", {
    method: "POST",
    body: JSON.stringify({
      employee: { id: EMPLOYEE_ID },
      title,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: variant.departureDate,
        returnDate: variant.returnDate,
        departureTime: "08:00",
        returnTime: "18:00",
        departureFrom: variant.departureFrom,
        destination: "Bergen",
        detailedJourneyDescription: title,
        purpose: title,
      },
      perDiemCompensations: [
        {
          location: "Bergen",
          count: 4,
          rate: 800,
          amount: 3200,
          rateType: { id: refs.rateTypeId },
          overnightAccommodation: "HOTEL",
        },
      ],
      costs: [
        {
          costCategory: { id: refs.flightCategoryId },
          paymentType: { id: refs.paymentTypeId },
          vatType: { id: 0 },
          comments: "billete de avión",
          amountCurrencyIncVat: 7800,
          amountNOKInclVAT: 7800,
          date: variant.departureDate,
        },
        {
          costCategory: { id: refs.taxiCategoryId },
          paymentType: { id: refs.paymentTypeId },
          vatType: { id: 0 },
          comments: "taxi",
          amountCurrencyIncVat: 600,
          amountNOKInclVAT: 600,
          date: variant.returnDate,
        },
      ],
    }),
  });

  const id = created.value?.id;
  if (!id) throw new Error(`Create missing id for ${variant.key}`);

  const delivered = await api<ListResponse<any>>(
    "travelExpense/:deliver",
    { method: "PUT" },
    { id: Number(id) },
  );
  const row = (delivered.values ?? []).find((value) => value?.id === id) ?? delivered.values?.[0];
  if (!row) throw new Error(`Deliver missing row for ${variant.key}`);

  const [costs, perDiems] = await Promise.all([
    api<ListResponse<any>>("travelExpense/cost", undefined, {
      travelExpenseId: Number(id),
      count: 20,
      fields: "*",
    }),
    api<ListResponse<any>>("travelExpense/perDiemCompensation", undefined, {
      travelExpenseId: Number(id),
      count: 20,
      fields: "*",
    }),
  ]);

  return {
    key: variant.key,
    id,
    deliveredState: row.state,
    departureDate: row.travelDetails?.departureDate,
    returnDate: row.travelDetails?.returnDate,
    departureFrom: row.travelDetails?.departureFrom,
    destination: row.travelDetails?.destination,
    costCount: Array.isArray(costs.values) ? costs.values.length : null,
    perDiemCount: Array.isArray(perDiems.values) ? perDiems.values.length : null,
    costDates: (costs.values ?? []).map((cost) => cost?.date),
    perDiemAmounts: (perDiems.values ?? []).map((perDiem) => ({
      count: perDiem?.count,
      rate: perDiem?.rate,
      amount: perDiem?.amount,
    })),
  };
}

async function main() {
  const [employee, company, categories, paymentTypes, rates] = await Promise.all([
    api<WrappedResponse<any>>(`employee/${EMPLOYEE_ID}`, undefined, { fields: "*" }),
    api<WrappedResponse<any>>(`company/${COMPANY_ID}`, undefined, { fields: "*,address(*)" }),
    api<ListResponse<any>>("travelExpense/costCategory", undefined, {
      count: 1000,
      fields: "*",
    }),
    api<ListResponse<any>>("travelExpense/paymentType", undefined, {
      count: 1000,
      fields: "*",
    }),
    api<ListResponse<any>>("travelExpense/rate", undefined, {
      type: "PER_DIEM",
      isValidDomestic: true,
      dateFrom: "2026-03-16",
      dateTo: "2026-03-20",
      count: 1000,
      fields: "*",
    }),
  ]);

  const flightCategory = pickCostCategory(categories.values ?? [], "Fly");
  const taxiCategory = pickCostCategory(categories.values ?? [], "Taxi");
  const paymentType = pickPaymentType(paymentTypes.values ?? []);
  const rateType = pickRateType(rates.values ?? []);

  const variants: Variant[] = [
    {
      key: "current-doc-dates-company-city",
      departureDate: "2026-03-17",
      returnDate: "2026-03-20",
      departureFrom: String(company.value?.address?.city ?? "Oslo"),
    },
    {
      key: "past-tense-dates-company-city",
      departureDate: "2026-03-16",
      returnDate: "2026-03-19",
      departureFrom: String(company.value?.address?.city ?? "Oslo"),
    },
    {
      key: "current-doc-dates-alt-city",
      departureDate: "2026-03-17",
      returnDate: "2026-03-20",
      departureFrom: "Drammen",
    },
  ];

  const results = [];
  for (const variant of variants) {
    results.push(
      await createAndDeliver(variant, {
        flightCategoryId: Number(flightCategory.id),
        taxiCategoryId: Number(taxiCategory.id),
        paymentTypeId: Number(paymentType.id),
        rateTypeId: Number(rateType.id),
      }),
    );
  }

  console.log(
    JSON.stringify(
      {
        employee: {
          id: employee.value?.id,
          email: employee.value?.email,
          address: employee.value?.address,
          companyId: employee.value?.companyId,
        },
        company: {
          id: company.value?.id,
          address: company.value?.address,
        },
        refs: {
          flightCategoryId: flightCategory.id,
          taxiCategoryId: taxiCategory.id,
          paymentTypeId: paymentType.id,
          rateTypeId: rateType.id,
          rateTypeRate: rateType.rate,
        },
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
