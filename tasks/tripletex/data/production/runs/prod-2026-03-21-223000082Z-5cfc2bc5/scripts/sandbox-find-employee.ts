const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { method, headers: H });
  const json = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  return json;
}

async function main() {
  // Find employees
  const empRes = await api("GET", "/employee?count=20&fields=id,firstName,lastName,email,dateOfBirth");
  for (const e of empRes.values || []) {
    console.log(`  id=${e.id} ${e.firstName} ${e.lastName} email=${e.email} dob=${e.dateOfBirth}`);
  }

  // Check existing divisions
  const divRes = await api("GET", "/division?count=5&fields=id,name");
  for (const d of divRes.values || []) {
    console.log(`  Division: id=${d.id} name=${d.name}`);
  }
}
main().catch(console.error);
