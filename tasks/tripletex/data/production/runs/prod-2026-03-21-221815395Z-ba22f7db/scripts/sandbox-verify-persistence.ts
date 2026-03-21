const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`Status: ${res.status}`);
  if (res.status >= 400) console.log("Error:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Replicate the exact production flow for sandbox verification
  const [divRes, deptRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "Markedsføring Sandbox ba22f7db" }),
  ]);

  const divisionId = divRes.data?.values?.[0]?.id;
  const departmentId = deptRes.data?.value?.id;
  console.log("Division ID:", divisionId ?? "none");
  console.log("Department ID:", departmentId);

  const employeePayload: any = {
    firstName: "William",
    lastName: "Johnson Sandbox ba22f7db",
    dateOfBirth: "1990-02-20",
    nationalIdentityNumber: "20029047368",
    email: "william.johnson.ba22f7db@example.org",
    bankAccountNumber: "64387484939",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [
      {
        startDate: "2026-11-11",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-11-11",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 80,
            annualSalary: 920000,
            occupationCode: { id: 2503 },
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee?fields=*,employments(*)", employeePayload);

  if (empRes.status !== 201) {
    console.error("Employee creation failed, stopping");
    return;
  }

  const empId = empRes.data?.value?.id;
  const employmentId = empRes.data?.value?.employments?.[0]?.id;
  console.log("\n=== Employee Created ===");
  console.log("Employee ID:", empId);
  console.log("Employment ID:", employmentId);
  console.log("firstName:", empRes.data?.value?.firstName);
  console.log("lastName:", empRes.data?.value?.lastName);
  console.log("dateOfBirth:", empRes.data?.value?.dateOfBirth);
  console.log("email:", empRes.data?.value?.email);
  console.log("nationalIdentityNumber:", empRes.data?.value?.nationalIdentityNumber);
  console.log("bankAccountNumber:", empRes.data?.value?.bankAccountNumber);
  console.log("startDate:", empRes.data?.value?.employments?.[0]?.startDate);

  // Now verify with a readback of employment details
  console.log("\n=== Readback: Employment Details ===");
  const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
  if (detailsRes.status === 200) {
    const d = detailsRes.data?.values?.[0];
    console.log("employmentType:", d?.employmentType);
    console.log("employmentForm:", d?.employmentForm);
    console.log("remunerationType:", d?.remunerationType);
    console.log("workingHoursScheme:", d?.workingHoursScheme);
    console.log("percentageOfFullTimeEquivalent:", d?.percentageOfFullTimeEquivalent);
    console.log("annualSalary:", d?.annualSalary);
    console.log("occupationCode.id:", d?.occupationCode?.id);
    console.log("occupationCode.nameNO:", d?.occupationCode?.nameNO);
    console.log("occupationCode.code:", d?.occupationCode?.code);
  }
}

main();
