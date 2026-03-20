const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "Y_LrooX7a0FdYXKlqikKDhTh8n8Wqf57f193rzBmVRA";

const task = {
  employeeEmail: "miguel.perez@example.org",
  title: "Visita cliente Tromsø",
  destination: "Tromsø",
  departureDate: "2026-03-16",
  returnDate: "2026-03-20",
  departureTime: "08:00",
  returnTime: "18:00",
  perDiemCount: 5,
  perDiemRate: 800,
  perDiemAmount: 4000,
  flightAmount: 2600,
  taxiAmount: 800,
};

type QueryValue = string | number | boolean | undefined | null;

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function api<T>(
  method: string,
  path: string,
  options: { query?: Record<string, QueryValue>; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const invalidToken =
      response.status === 403 &&
      typeof data?.error === "string" &&
      data.error.includes("Invalid or expired token");
    if (invalidToken) {
      throw new Error(`Blocked: invalid_or_expired_token ${JSON.stringify(data)}`);
    }
    throw new Error(`HTTP ${response.status} ${method} ${path} ${JSON.stringify(data)}`);
  }

  return data as T;
}

function exactEmailEmployees(values: any[], email: string) {
  const target = email.toLowerCase();
  return values.filter((employee) => String(employee?.email ?? "").toLowerCase() === target);
}

function pickEmployee(values: any[], email: string) {
  const exact = exactEmailEmployees(values, email);
  if (exact.length === 1) {
    return exact[0];
  }
  const registerable = exact.filter((employee) => employee?.allowInformationRegistration === true);
  if (registerable.length === 1) {
    return registerable[0];
  }
  throw new Error(`Employee resolution failed for ${email}: ${exact.length} exact matches`);
}

function inferDepartureFrom(employee: any) {
  return (
    employee?.address?.city ||
    employee?.address?.addressLine1 ||
    employee?.address?.displayName ||
    employee?.address?.addressAsString ||
    employee?.address?.displayNameInklMatrikkel ||
    null
  );
}

function inferCompanyDepartureFrom(company: any) {
  return (
    company?.address?.city ||
    company?.address?.addressLine1 ||
    company?.address?.displayName ||
    company?.address?.addressAsString ||
    company?.address?.displayNameInklMatrikkel ||
    null
  );
}

function pickByExactDescription(values: any[], description: string) {
  return values.find((value) => value?.description === description) ?? null;
}

function pickPaymentType(values: any[]) {
  const activeTravel = values.filter(
    (value) => value?.showOnTravelExpenses === true && value?.isInactive !== true,
  );
  return (
    activeTravel.find((value) => value?.description === "Privat utlegg") ||
    activeTravel[0] ||
    null
  );
}

function pickRateType(values: any[], rate: number) {
  return values.find((value) => Number(value?.rate) === rate) || values[0] || null;
}

function unwrapList(data: any) {
  if (Array.isArray(data?.values)) {
    return data.values;
  }
  if (Array.isArray(data?.value)) {
    return data.value;
  }
  return [];
}

function unwrapSingle(data: any) {
  if (data && typeof data === "object" && "value" in data) {
    return data.value;
  }
  return data;
}

async function main() {
  const employeeResponse = await api<any>("GET", "employee", {
    query: {
      email: task.employeeEmail,
      count: 10,
      fields: "*",
    },
  });

  const employee = pickEmployee(unwrapList(employeeResponse), task.employeeEmail);
  let departureFrom = inferDepartureFrom(employee);
  if (!departureFrom && employee?.companyId) {
    const companyResponse = await api<any>("GET", `company/${employee.companyId}`, {
      query: { fields: "*" },
    });
    departureFrom = inferCompanyDepartureFrom(unwrapSingle(companyResponse));
  }
  if (!departureFrom) {
    departureFrom = "Oslo";
  }

  const [costCategoryResponse, paymentTypeResponse, rateResponse] = await Promise.all([
    api<any>("GET", "travelExpense/costCategory", {
      query: { count: 1000, fields: "*" },
    }),
    api<any>("GET", "travelExpense/paymentType", {
      query: { count: 1000, fields: "*" },
    }),
    api<any>("GET", "travelExpense/rate", {
      query: {
        type: "PER_DIEM",
        isValidDomestic: true,
        dateFrom: task.departureDate,
        dateTo: task.returnDate,
        count: 1000,
        fields: "*",
      },
    }),
  ]);

  const costCategories = unwrapList(costCategoryResponse).filter(
    (value: any) => value?.showOnTravelExpenses === true,
  );
  const paymentTypes = unwrapList(paymentTypeResponse);
  const rates = unwrapList(rateResponse);

  const flightCategory = pickByExactDescription(costCategories, "Fly");
  const taxiCategory = pickByExactDescription(costCategories, "Taxi");
  const paymentType = pickPaymentType(paymentTypes);
  const rateType = pickRateType(rates, task.perDiemRate);

  if (!flightCategory || !taxiCategory || !paymentType || !rateType) {
    throw new Error(
      `Resolution failed: ${JSON.stringify({
        flightCategory: flightCategory?.id ?? null,
        taxiCategory: taxiCategory?.id ?? null,
        paymentType: paymentType?.id ?? null,
        rateType: rateType?.id ?? null,
      })}`,
    );
  }

  const createResponse = await api<any>("POST", "travelExpense", {
    body: {
      employee: { id: employee.id },
      title: task.title,
      travelDetails: {
        isForeignTravel: false,
        isDayTrip: false,
        isCompensationFromRates: true,
        departureDate: task.departureDate,
        returnDate: task.returnDate,
        departureTime: task.departureTime,
        returnTime: task.returnTime,
        departureFrom,
        destination: task.destination,
        detailedJourneyDescription: task.title,
        purpose: task.title,
      },
      perDiemCompensations: [
        {
          location: task.destination,
          rateType: { id: rateType.id },
          overnightAccommodation: "HOTEL",
          count: task.perDiemCount,
          rate: task.perDiemRate,
          amount: task.perDiemAmount,
        },
      ],
      costs: [
        {
          costCategory: { id: flightCategory.id },
          paymentType: { id: paymentType.id },
          vatType: { id: 0 },
          comments: "billete de avión",
          amountCurrencyIncVat: task.flightAmount,
          amountNOKInclVAT: task.flightAmount,
          date: task.departureDate,
        },
        {
          costCategory: { id: taxiCategory.id },
          paymentType: { id: paymentType.id },
          vatType: { id: 0 },
          comments: "taxi",
          amountCurrencyIncVat: task.taxiAmount,
          amountNOKInclVAT: task.taxiAmount,
          date: task.returnDate,
        },
      ],
    },
  });

  const created = unwrapSingle(createResponse);
  if (!created?.id) {
    throw new Error(`Create failed: missing travelExpense id in ${JSON.stringify(createResponse)}`);
  }

  const deliverResponse = await api<any>("PUT", "travelExpense/:deliver", {
    query: { id: created.id },
  });
  const delivered = unwrapList(deliverResponse)[0];
  if (!delivered || delivered?.state !== "DELIVERED") {
    throw new Error(`Deliver failed: ${JSON.stringify(deliverResponse)}`);
  }

  console.log(
    JSON.stringify(
      {
        id: delivered.id,
        state: delivered.state,
        title: delivered.title,
        employeeId: delivered.employee?.id,
        departureDate: delivered.travelDetails?.departureDate,
        returnDate: delivered.travelDetails?.returnDate,
        departureFrom: delivered.travelDetails?.departureFrom,
        destination: delivered.travelDetails?.destination,
        costs: Array.isArray(delivered.costs) ? delivered.costs.length : null,
        perDiemCompensations: Array.isArray(delivered.perDiemCompensations)
          ? delivered.perDiemCompensations.length
          : null,
      },
      null,
      2,
    ),
  );
}

await main();
