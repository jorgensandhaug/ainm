#!/usr/bin/env bun
/**
 * T13 Investigation Script 02: Test VAT on travel costs and per-diem variations
 *
 * Tests:
 * A) Flight with vatType=12 (12% input VAT, "Fradrag inngående avgift, lav sats")
 * B) Taxi with vatType=12 (12% input VAT)
 * C) Per-diem with count=days (not overnights)
 * D) Per-diem with system rate 1012 instead of prompt rate 800
 * E) Check what Tripletex stores for amountNOKInclVATLow when we use vatType=12
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const HEADERS = {
  "Authorization": `Basic ${btoa("0:" + TOKEN)}`,
  "Content-Type": "application/json",
};

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function main() {
  // Known sandbox IDs
  const empId = 18478235;
  const flyCatId = 32813722;
  const taxiCatId = 32813737;
  const payTypeId = 32813706;

  // Test A: Create travel expense with 12% input VAT on flight and taxi
  console.log("=== TEST A: Flight + Taxi with 12% input VAT (vatType=12) ===");
  const payloadA = {
    employee: { id: empId },
    title: "T13 Test A - VAT 12%",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-24",
      returnDate: "2026-03-27",
      departureFrom: "Oslo",
      destination: "Bergen",
      departureTime: "08:00",
      returnTime: "18:00",
      purpose: "T13 VAT test",
      detailedJourneyDescription: "T13 VAT test",
    },
    costs: [
      {
        costCategory: { id: flyCatId },
        paymentType: { id: payTypeId },
        comments: "Flybillett",
        amountCurrencyIncVat: 6150,
        amountNOKInclVAT: 6150,
        vatType: { id: 12 },  // 12% input VAT (lav sats)
        date: "2026-03-24",
      },
      {
        costCategory: { id: taxiCatId },
        paymentType: { id: payTypeId },
        comments: "Taxi",
        amountCurrencyIncVat: 750,
        amountNOKInclVAT: 750,
        vatType: { id: 12 },  // 12% input VAT (lav sats)
        date: "2026-03-24",
      },
    ],
    perDiemCompensations: [
      {
        location: "Bergen",
        count: 3,  // overnights = 4 days - 1
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  };

  const resA = await api("POST", "/travelExpense", payloadA);
  if (resA.status === 201) {
    const teA = resA.data.value;
    console.log(`  Created: ${teA.id} state=${teA.state}`);

    // Deliver
    const delA = await api("PUT", `/travelExpense/:deliver?id=${teA.id}`);
    if (delA.status === 200) {
      const d = delA.data.values?.[0] || delA.data.value;
      console.log(`  Delivered: ${d?.id} state=${d?.state}`);

      // Read back costs with full details
      const costsA = await api("GET", `/travelExpense/cost?travelExpenseId=${teA.id}&count=20&fields=*`);
      if (costsA.status === 200) {
        console.log("  Costs with VAT 12%:");
        for (const c of costsA.data.values) {
          console.log(`    comments="${c.comments}" amountIncVat=${c.amountCurrencyIncVat} amountNOKInclVAT=${c.amountNOKInclVAT}`);
          console.log(`      amountNOKInclVATLow=${c.amountNOKInclVATLow} amountNOKInclVATMedium=${c.amountNOKInclVATMedium} amountNOKInclVATHigh=${c.amountNOKInclVATHigh}`);
          console.log(`      vatType: id=${c.vatType?.id} rate=${c.rate}`);
        }
      }
    } else {
      console.log(`  Deliver FAILED: ${delA.status}`, JSON.stringify(delA.data).slice(0, 500));
    }
  } else {
    console.log(`  POST FAILED: ${resA.status}`, JSON.stringify(resA.data).slice(0, 500));
  }

  // Test B: Create travel expense with vatType=0 (current approach) for comparison
  console.log("\n=== TEST B: Flight + Taxi with vatType=0 (no VAT, current approach) ===");
  const payloadB = {
    employee: { id: empId },
    title: "T13 Test B - VAT 0",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-24",
      returnDate: "2026-03-27",
      departureFrom: "Oslo",
      destination: "Bergen",
      departureTime: "08:00",
      returnTime: "18:00",
      purpose: "T13 VAT test",
      detailedJourneyDescription: "T13 VAT test",
    },
    costs: [
      {
        costCategory: { id: flyCatId },
        paymentType: { id: payTypeId },
        comments: "Flybillett",
        amountCurrencyIncVat: 6150,
        amountNOKInclVAT: 6150,
        vatType: { id: 0 },  // No VAT (current approach)
        date: "2026-03-24",
      },
      {
        costCategory: { id: taxiCatId },
        paymentType: { id: payTypeId },
        comments: "Taxi",
        amountCurrencyIncVat: 750,
        amountNOKInclVAT: 750,
        vatType: { id: 0 },  // No VAT
        date: "2026-03-24",
      },
    ],
    perDiemCompensations: [
      {
        location: "Bergen",
        count: 3,  // overnights = 4 days - 1
        rate: 800,
        amount: 2400,
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  };

  const resB = await api("POST", "/travelExpense", payloadB);
  if (resB.status === 201) {
    const teB = resB.data.value;
    console.log(`  Created: ${teB.id} state=${teB.state}`);

    const delB = await api("PUT", `/travelExpense/:deliver?id=${teB.id}`);
    if (delB.status === 200) {
      const d = delB.data.values?.[0] || delB.data.value;
      console.log(`  Delivered: ${d?.id} state=${d?.state}`);

      const costsB = await api("GET", `/travelExpense/cost?travelExpenseId=${teB.id}&count=20&fields=*`);
      if (costsB.status === 200) {
        console.log("  Costs with VAT 0:");
        for (const c of costsB.data.values) {
          console.log(`    comments="${c.comments}" amountIncVat=${c.amountCurrencyIncVat} amountNOKInclVAT=${c.amountNOKInclVAT}`);
          console.log(`      amountNOKInclVATLow=${c.amountNOKInclVATLow} amountNOKInclVATMedium=${c.amountNOKInclVATMedium} amountNOKInclVATHigh=${c.amountNOKInclVATHigh}`);
          console.log(`      vatType: id=${c.vatType?.id} rate=${c.rate}`);
        }
      }
    } else {
      console.log(`  Deliver FAILED: ${delB.status}`, JSON.stringify(delB.data).slice(0, 500));
    }
  } else {
    console.log(`  POST FAILED: ${resB.status}`, JSON.stringify(resB.data).slice(0, 500));
  }

  // Test C: Per-diem with count=DAYS (4) instead of overnights (3)
  console.log("\n=== TEST C: Per-diem count=4 (days) instead of count=3 (overnights) ===");
  const payloadC = {
    employee: { id: empId },
    title: "T13 Test C - count=days",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-24",
      returnDate: "2026-03-27",
      departureFrom: "Oslo",
      destination: "Bergen",
      departureTime: "08:00",
      returnTime: "18:00",
      purpose: "T13 count test",
      detailedJourneyDescription: "T13 count test",
    },
    costs: [
      {
        costCategory: { id: flyCatId },
        paymentType: { id: payTypeId },
        comments: "Flybillett",
        amountCurrencyIncVat: 6150,
        amountNOKInclVAT: 6150,
        vatType: { id: 0 },
        date: "2026-03-24",
      },
      {
        costCategory: { id: taxiCatId },
        paymentType: { id: payTypeId },
        comments: "Taxi",
        amountCurrencyIncVat: 750,
        amountNOKInclVAT: 750,
        vatType: { id: 0 },
        date: "2026-03-24",
      },
    ],
    perDiemCompensations: [
      {
        location: "Bergen",
        count: 4,  // DAYS (not overnights)
        rate: 800,
        amount: 3200,  // 4 * 800
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  };

  const resC = await api("POST", "/travelExpense", payloadC);
  if (resC.status === 201) {
    const teC = resC.data.value;
    console.log(`  Created: ${teC.id} state=${teC.state}`);

    const delC = await api("PUT", `/travelExpense/:deliver?id=${teC.id}`);
    if (delC.status === 200) {
      const d = delC.data.values?.[0] || delC.data.value;
      console.log(`  Delivered: ${d?.id} state=${d?.state}`);

      const perDiemC = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teC.id}&count=20&fields=*`);
      if (perDiemC.status === 200) {
        console.log("  PerDiem with count=4:");
        for (const p of perDiemC.data.values) {
          console.log(`    count=${p.count} rate=${p.rate} amount=${p.amount}`);
          console.log(`    isDeductionForBreakfast=${p.isDeductionForBreakfast} isDeductionForLunch=${p.isDeductionForLunch} isDeductionForDinner=${p.isDeductionForDinner}`);
        }
      }
    } else {
      console.log(`  Deliver FAILED: ${delC.status}`, JSON.stringify(delC.data).slice(0, 500));
    }
  } else {
    console.log(`  POST FAILED: ${resC.status}`, JSON.stringify(resC.data).slice(0, 500));
  }

  // Test D: Per-diem with system rate 1012 instead of prompt rate 800
  console.log("\n=== TEST D: Per-diem rate=1012 (system rate) instead of rate=800 (prompt rate) ===");
  const payloadD = {
    employee: { id: empId },
    title: "T13 Test D - rate=1012",
    travelDetails: {
      isForeignTravel: false,
      isDayTrip: false,
      isCompensationFromRates: true,
      departureDate: "2026-03-24",
      returnDate: "2026-03-27",
      departureFrom: "Oslo",
      destination: "Bergen",
      departureTime: "08:00",
      returnTime: "18:00",
      purpose: "T13 rate test",
      detailedJourneyDescription: "T13 rate test",
    },
    costs: [
      {
        costCategory: { id: flyCatId },
        paymentType: { id: payTypeId },
        comments: "Flybillett",
        amountCurrencyIncVat: 6150,
        amountNOKInclVAT: 6150,
        vatType: { id: 0 },
        date: "2026-03-24",
      },
      {
        costCategory: { id: taxiCatId },
        paymentType: { id: payTypeId },
        comments: "Taxi",
        amountCurrencyIncVat: 750,
        amountNOKInclVAT: 750,
        vatType: { id: 0 },
        date: "2026-03-24",
      },
    ],
    perDiemCompensations: [
      {
        location: "Bergen",
        count: 3,  // overnights
        rate: 1012,  // system rate
        amount: 3036,  // 3 * 1012
        rateType: { id: 25888, rateCategory: { id: 740 } },
        overnightAccommodation: "HOTEL",
      },
    ],
  };

  const resD = await api("POST", "/travelExpense", payloadD);
  if (resD.status === 201) {
    const teD = resD.data.value;
    console.log(`  Created: ${teD.id} state=${teD.state}`);

    const delD = await api("PUT", `/travelExpense/:deliver?id=${teD.id}`);
    if (delD.status === 200) {
      const d = delD.data.values?.[0] || delD.data.value;
      console.log(`  Delivered: ${d?.id} state=${d?.state}`);

      const perDiemD = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${teD.id}&count=20&fields=*`);
      if (perDiemD.status === 200) {
        console.log("  PerDiem with rate=1012:");
        for (const p of perDiemD.data.values) {
          console.log(`    count=${p.count} rate=${p.rate} amount=${p.amount}`);
        }
      }
    } else {
      console.log(`  Deliver FAILED: ${delD.status}`, JSON.stringify(delD.data).slice(0, 500));
    }
  } else {
    console.log(`  POST FAILED: ${resD.status}`, JSON.stringify(resD.data).slice(0, 500));
  }

  // Test E: Check what cost category default vatTypes are
  console.log("\n=== TEST E: Cost category default vatTypes ===");
  const cats = await api("GET", "/travelExpense/costCategory?count=1000&fields=*");
  if (cats.status === 200) {
    for (const c of cats.data.values) {
      if (c.showOnTravelExpenses) {
        console.log(`  id=${c.id} description="${c.description}" vatType=${JSON.stringify(c.vatType)} isWithVat=${c.isWithVat} showOnTravelExpenses=${c.showOnTravelExpenses}`);
      }
    }
  }

  // Test F: Check TravelExpenseSettings
  console.log("\n=== TEST F: Travel Expense Settings ===");
  const settings = await api("GET", "/travelExpense/settings");
  if (settings.status === 200) {
    console.log("  Settings:", JSON.stringify(settings.data.value, null, 2));
  } else {
    console.log("  Error:", settings.status, JSON.stringify(settings.data).slice(0, 500));
  }
}

main().catch(console.error);
