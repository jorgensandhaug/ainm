const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} => ${res.status}`);
  if (!res.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Try creating employee with userType
  const uid = Math.random().toString(36).slice(2, 8);
  const EMAIL = `proof-${uid}@example.org`;

  // Get department
  const deptRes = await api("GET", "/department?count=1&fields=*");
  const deptId = deptRes.data?.values?.[0]?.id;

  // Try with userType and department
  const empRes = await api("POST", "/employee", {
    firstName: "ProofDiv",
    lastName: uid,
    email: EMAIL,
    userType: "STANDARD",
    department: { id: deptId },
  });
  console.log("Employee create:", empRes.status);
  if (empRes.status === 201 || empRes.status === 200) {
    const emp = empRes.data?.value;
    console.log("ID:", emp?.id, "DOB:", emp?.dateOfBirth, "Employments:", JSON.stringify(emp?.employments));
  } else {
    // Try with different userType values
    for (const ut of ["NONE", "EMPLOYEE", "STANDARD", "ADMIN"]) {
      console.log(`\nTrying userType=${ut}`);
      const r = await api("POST", "/employee", {
        firstName: "ProofDiv",
        lastName: uid + ut,
        email: `proof-${uid}-${ut}@example.org`,
        userType: ut,
        department: { id: deptId },
      });
      if (r.status === 201 || r.status === 200) {
        console.log("SUCCESS with userType:", ut);
        console.log("Employee:", JSON.stringify(r.data?.value, null, 2));
        break;
      }
    }
  }
}

main().catch(console.error);
