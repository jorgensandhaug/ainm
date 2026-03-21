// Quick readback of the final proof project to verify overallStatus

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  return r.json();
}

async function main() {
  // Use the project from the final proof (evtxhi)
  // Need to find it by recent creation
  const projRes = await api("GET", "/project?name=Migra%C3%A7%C3%A3o%20Cloud%20Horizonte%20evtxhi&fields=id,name,isFixedPrice,fixedprice");
  const proj = projRes.values?.[0];
  if (!proj) { console.log("Project not found, trying by ID..."); return; }

  const projectId = proj.id;
  console.log("Project:", proj.name, "id:", projectId);
  console.log("  isFixedPrice:", proj.isFixedPrice, "fixedprice:", proj.fixedprice);

  // Overall status
  const statusRes = await api("GET", `/project/${projectId}/period/overallStatus?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`);
  console.log("\nOverall Status:");
  console.log("  income:", statusRes.value?.income);
  console.log("  costs:", statusRes.value?.costs);

  // Participants
  const partRes = await api("GET", `/project/${projectId}?fields=participants(*)`);
  console.log("\nParticipants:");
  for (const p of partRes.value?.participants || []) {
    console.log(`  emp=${p.employee?.id} admin=${p.adminAccess}`);
  }

  // Activities
  const actRes = await api("GET", `/project/${projectId}?fields=projectActivities(*)`);
  console.log("\nActivities:");
  for (const a of actRes.value?.projectActivities || []) {
    console.log(`  budget=${a.budgetFeeCurrency} hours=${a.budgetHours}`);
  }

  console.log("\nDone.");
}

main().catch(e => console.error(e));
