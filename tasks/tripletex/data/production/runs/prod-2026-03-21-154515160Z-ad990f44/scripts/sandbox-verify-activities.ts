const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H });
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

// Fetch the projects with full activity expansion
const res = await api("GET", "/project?id=402015296,402015297&fields=*,projectActivities(*),projectActivities(activity(*))");
const projects = res.values || [];
for (const p of projects) {
  console.log(`\nProject id=${p.id}, name=${p.name}, isInternal=${p.isInternal}`);
  if (p.projectActivities) {
    for (const pa of p.projectActivities) {
      console.log(`  ProjectActivity id=${pa.id}`);
      console.log(`  Activity:`, JSON.stringify(pa.activity, null, 2));
    }
  }
}

// Also check the activity directly
const actRes = await api("GET", "/activity?id=5904833,5904834&fields=*");
console.log("\nDirect activity lookup:");
const activities = actRes.values || [];
for (const a of activities) {
  console.log(`  Activity id=${a.id}, name=${a.name}, activityType=${a.activityType}, isChargeable=${a.isChargeable}`);
}
