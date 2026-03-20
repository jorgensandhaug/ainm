const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${token}`).toString("base64");

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}\n${text}`);
  }
  return data;
}

const employeeRes = await api(
  `/employee?email=${encodeURIComponent("lucy.walker@example.org")}&count=10&fields=*`,
);
const employee = (employeeRes.values ?? []).find(
  (item: any) => item.email === "lucy.walker@example.org",
);
if (!employee?.id) throw new Error("Employee not found");

const created = await api("/travelExpense", {
  method: "POST",
  body: JSON.stringify({
    employee: { id: employee.id },
    title: "Deliverable travel expense probe",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-16",
      returnDate: "2026-03-20",
      departureFrom: "Oslo",
      destination: "Ålesund",
      departureTime: "08:00",
      returnTime: "18:00",
      detailedJourneyDescription: "Deliverable travel expense probe",
      purpose: "Deliverable travel expense probe",
    },
    perDiemCompensations: [
      {
        location: "Ålesund",
        overnightAccommodation: "HOTEL",
        rateType: { id: 25890 },
        count: 5,
        rate: 800,
        amount: 4000,
      },
    ],
    costs: [
      {
        costCategory: { id: 32813722 },
        paymentType: { id: 32813706 },
        vatType: { id: 0 },
        comments: "flight ticket",
        amountCurrencyIncVat: 2750,
        amountNOKInclVAT: 2750,
        date: "2026-03-16",
      },
      {
        costCategory: { id: 32813737 },
        paymentType: { id: 32813706 },
        vatType: { id: 0 },
        comments: "taxi",
        amountCurrencyIncVat: 700,
        amountNOKInclVAT: 700,
        date: "2026-03-20",
      },
    ],
  }),
});

const id = created.value?.id;
if (!id) throw new Error("Create missing id");

const delivered = await api(`/travelExpense/:deliver?id=${id}`, { method: "PUT" });

const finalRead = await api(`/travelExpense/${id}?fields=*`);

console.log(
  JSON.stringify(
    {
      created: created.value,
      delivered: delivered.values?.[0],
      finalRead: finalRead.value,
    },
    null,
    2,
  ),
);
