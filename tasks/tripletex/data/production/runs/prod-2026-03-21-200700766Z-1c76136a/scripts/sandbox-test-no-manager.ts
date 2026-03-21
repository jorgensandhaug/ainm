const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test: POST /project/list without projectManager — does it auto-assign or 422?
const r = await fetch(`${BASE}/project/list`, {
  method: "POST",
  headers: H,
  body: JSON.stringify([{
    name: "SB Test No Manager " + Date.now(),
    startDate: "2026-03-21",
    isInternal: true,
    projectActivities: [{
      startDate: "2026-03-21",
      activity: {
        name: "SB Test Activity",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }],
  }]),
});

const t = await r.text();
console.log(`POST /project/list (no manager) → ${r.status}`);
console.log(t.substring(0, 500));
