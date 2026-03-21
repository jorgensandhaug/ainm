const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "xOkmYSXUn_JJ8p6t9FmXKEH-qJd2mepOfK6dnPzbBkc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  return json;
}

async function main() {
  // Step 1: Get employee
  const empRes = await api("GET", "/employee?email=miguel.perez@example.org&count=10&fields=*");
  const employees = empRes.values;
  if (!employees || employees.length === 0) throw new Error("Employee not found");
  const emp = employees.find((e: any) => e.allowInformationRegistration) || employees[0];
  console.log(`Employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, address=${JSON.stringify(emp.address)}, companyId=${emp.companyId}`);

  // Step 2: Parallel reads — company (if no address) + costCategory + paymentType
  let departureFrom: string | null = null;
  if (emp.address?.city) {
    departureFrom = emp.address.city;
  } else if (emp.address?.addressLine1) {
    departureFrom = emp.address.addressLine1;
  }

  const parallelCalls: Promise<any>[] = [
    api("GET", "/travelExpense/costCategory?count=1000&fields=*"),
    api("GET", "/travelExpense/paymentType?count=1000&fields=*"),
  ];
  if (!departureFrom && emp.companyId) {
    parallelCalls.push(api("GET", `/company/${emp.companyId}?fields=*,address(*)`));
  }

  const results = await Promise.all(parallelCalls);
  const costCatRes = results[0];
  const payTypeRes = results[1];

  if (!departureFrom && results[2]) {
    const company = results[2].value;
    departureFrom = company?.address?.city
      || company?.address?.addressLine1
      || company?.address?.displayName
      || company?.address?.addressAsString;
  }

  if (!departureFrom) throw new Error("No departureFrom resolvable — blocked");
  console.log(`departureFrom: ${departureFrom}`);

  // Resolve cost categories
  const travelCats = costCatRes.values.filter((c: any) => c.showOnTravelExpenses);
  const flyCat = travelCats.find((c: any) => c.description === "Fly");
  const taxiCat = travelCats.find((c: any) => c.description === "Taxi");
  if (!flyCat || !taxiCat) throw new Error(`Missing categories: fly=${flyCat?.id}, taxi=${taxiCat?.id}`);
  console.log(`Categories: Fly=${flyCat.id}, Taxi=${taxiCat.id}`);

  // Resolve payment type
  const travelPayTypes = payTypeRes.values.filter((p: any) => p.showOnTravelExpenses);
  const payType = travelPayTypes[0];
  if (!payType) throw new Error("No travel payment type found");
  console.log(`PaymentType: ${payType.id} (${payType.description})`);

  // Step 3: POST travel expense
  // Duration-only: 5 days, deterministic dates
  const departureDate = "2026-03-17";
  const returnDate = "2026-03-21";

  const payload = {
    employee: { id: emp.id },
    title: "Visita cliente Tromsø",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate,
      returnDate,
      departureTime: "08:00",
      returnTime: "18:00",
      departureFrom,
      destination: "Tromsø",
      detailedJourneyDescription: "Visita cliente Tromsø",
      purpose: "Visita cliente Tromsø",
    },
    perDiemCompensations: [
      {
        location: "Tromsø",
        count: 5,
        rate: 800,
        amount: 4000,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
    costs: [
      {
        costCategory: { id: flyCat.id },
        paymentType: { id: payType.id },
        comments: "billete de avión",
        amountCurrencyIncVat: 2600,
        amountNOKInclVAT: 2600,
        vatType: { id: 0 },
        date: departureDate,
      },
      {
        costCategory: { id: taxiCat.id },
        paymentType: { id: payType.id },
        comments: "taxi",
        amountCurrencyIncVat: 800,
        amountNOKInclVAT: 800,
        vatType: { id: 0 },
        date: returnDate,
      },
    ],
  };

  const createRes = await api("POST", "/travelExpense", payload);
  const te = createRes.value;
  console.log(`Created travel expense: id=${te.id}, state=${te.state}, costs=${te.costs?.length}, perDiems=${te.perDiemCompensations?.length}`);

  // Step 4: Deliver
  const deliverRes = await api("PUT", `/travelExpense/:deliver?id=${te.id}`);
  const delivered = deliverRes.values?.[0] || deliverRes.value;
  console.log(`Delivered: id=${delivered.id}, state=${delivered.state}`);
  console.log(`Title: ${delivered.title}`);
  console.log(`Employee: ${delivered.employee?.id}`);
  console.log(`TravelDetails: departure=${delivered.travelDetails?.departureDate}, return=${delivered.travelDetails?.returnDate}, destination=${delivered.travelDetails?.destination}, departureFrom=${delivered.travelDetails?.departureFrom}`);
  console.log(`Costs count: ${delivered.costs?.length}`);
  console.log(`PerDiem count: ${delivered.perDiemCompensations?.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
