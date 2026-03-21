#!/usr/bin/env bun
/**
 * T13 Investigation Script 01: Explore sandbox state
 * - List available vatTypes
 * - Read back an existing delivered travel expense with full per-diem and cost details
 * - Check what fields Tripletex stores vs what we sent
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${atob(TOKEN).split('"token":"')[1].split('"')[0]}`);

// Actually the token IS the base64 of the JSON, and we use 0:api_token
// Let me just use the token directly
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
  // 1. List vatTypes
  console.log("=== VAT TYPES ===");
  const vat = await api("GET", "/ledger/vatType?count=100&fields=*");
  if (vat.status === 200 && vat.data.values) {
    for (const v of vat.data.values) {
      console.log(`  id=${v.id} name="${v.name}" number="${v.number}" percentage=${v.percentage} deductionPct=${v.deductionPercentage} displayName="${v.displayName}"`);
    }
    console.log(`  Total: ${vat.data.fullResultSize}`);
  } else {
    console.log("  Error:", vat.status, JSON.stringify(vat.data).slice(0, 500));
  }

  // 2. Read back existing delivered travel expenses
  console.log("\n=== EXISTING DELIVERED TRAVEL EXPENSES ===");
  // Use one of the known IDs from sandbox
  const knownIds = [11150595, 11150576, 11150554, 11150366, 11150367, 11150368];

  for (const id of knownIds.slice(0, 2)) {
    console.log(`\n--- Travel Expense ${id} ---`);
    const te = await api("GET", `/travelExpense/${id}?fields=*`);
    if (te.status === 200) {
      const d = te.data.value;
      console.log(`  state=${d.state} title="${d.title}" amount=${d.amount} paymentAmount=${d.paymentAmount}`);
      console.log(`  travelDetails:`, JSON.stringify(d.travelDetails, null, 2));
      console.log(`  costs count:`, d.costs?.length);
      console.log(`  perDiemCompensations count:`, d.perDiemCompensations?.length);

      // Read expanded costs
      const costs = await api("GET", `/travelExpense/cost?travelExpenseId=${id}&count=20&fields=*`);
      if (costs.status === 200 && costs.data.values) {
        console.log(`  --- Costs (expanded) ---`);
        for (const c of costs.data.values) {
          console.log(`    id=${c.id} category="${c.category}" comments="${c.comments}"`);
          console.log(`      amountCurrencyIncVat=${c.amountCurrencyIncVat} amountNOKInclVAT=${c.amountNOKInclVAT}`);
          console.log(`      amountNOKInclVATLow=${c.amountNOKInclVATLow} amountNOKInclVATMedium=${c.amountNOKInclVATMedium} amountNOKInclVATHigh=${c.amountNOKInclVATHigh}`);
          console.log(`      vatType:`, JSON.stringify(c.vatType));
          console.log(`      costCategory:`, JSON.stringify(c.costCategory));
          console.log(`      paymentType:`, JSON.stringify(c.paymentType));
          console.log(`      isPaidByEmployee=${c.isPaidByEmployee} isChargeable=${c.isChargeable} date=${c.date} rate=${c.rate}`);
        }
      }

      // Read expanded per-diem
      const perDiem = await api("GET", `/travelExpense/perDiemCompensation?travelExpenseId=${id}&count=20&fields=*`);
      if (perDiem.status === 200 && perDiem.data.values) {
        console.log(`  --- PerDiemCompensations (expanded) ---`);
        for (const p of perDiem.data.values) {
          console.log(`    id=${p.id} location="${p.location}" address="${p.address}"`);
          console.log(`      count=${p.count} rate=${p.rate} amount=${p.amount}`);
          console.log(`      rateType:`, JSON.stringify(p.rateType));
          console.log(`      rateCategory:`, JSON.stringify(p.rateCategory));
          console.log(`      overnightAccommodation=${p.overnightAccommodation}`);
          console.log(`      countryCode=${p.countryCode} travelExpenseZoneId=${p.travelExpenseZoneId}`);
          console.log(`      isDeductionForBreakfast=${p.isDeductionForBreakfast}`);
          console.log(`      isDeductionForLunch=${p.isDeductionForLunch}`);
          console.log(`      isDeductionForDinner=${p.isDeductionForDinner}`);
        }
      }
    } else {
      console.log("  Error:", te.status, JSON.stringify(te.data).slice(0, 500));
    }
  }

  // 3. Check what vatTypes are used for travel costs in existing expenses
  console.log("\n=== VAT TYPE DETAILS FOR TRAVEL ===");
  // Look for common Norwegian VAT types
  const vatSearch = await api("GET", "/ledger/vatType?count=100&fields=*");
  if (vatSearch.status === 200) {
    const lowVat = vatSearch.data.values.filter((v: any) => v.percentage === 12);
    console.log("  12% VAT types (lav sats):");
    for (const v of lowVat) {
      console.log(`    id=${v.id} name="${v.name}" number="${v.number}" displayName="${v.displayName}"`);
    }
    const zeroVat = vatSearch.data.values.filter((v: any) => v.percentage === 0);
    console.log("  0% VAT types:");
    for (const v of zeroVat) {
      console.log(`    id=${v.id} name="${v.name}" number="${v.number}" displayName="${v.displayName}"`);
    }
  }
}

main().catch(console.error);
