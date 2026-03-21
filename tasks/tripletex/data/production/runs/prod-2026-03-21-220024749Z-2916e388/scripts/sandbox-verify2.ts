// Verify: can we use whoAmI employeeId as project manager?
// This would be an alternative source for the manager ID (same call count)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Get the whoAmI employeeId
const whoAmI = await fetch(BASE + "/token/session/>whoAmI", { headers: H });
const whoData = await whoAmI.json();
const empId = whoData.value.employeeId;
console.log(`whoAmI employeeId: ${empId}`);

// Also get the assignableProjectManagers result for comparison
const empResp = await fetch(BASE + "/employee?assignableProjectManagers=true&count=1&fields=*", { headers: H });
const empData = await empResp.json();
const assignablePMId = empData.values[0]?.id;
console.log(`assignableProjectManagers[0].id: ${assignablePMId}`);
console.log(`Same ID? ${empId === assignablePMId}`);

// Try creating a project with whoAmI employee as PM
const ts = Date.now();
const r = await fetch(BASE + "/project/list", {
  method: "POST",
  headers: H,
  body: JSON.stringify([{
    name: `SandboxTest-WhoAmIPM-${ts}`,
    startDate: "2026-01-01",
    isInternal: true,
    projectManager: { id: empId },
    projectActivities: [{
      startDate: "2026-01-01",
      activity: { name: `SandboxTest-WhoAmIPM-${ts}`, activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false }
    }]
  }])
});
const text = await r.text();
console.log(`[whoAmI-as-PM] ${r.status}: ${text.substring(0, 500)}`);
