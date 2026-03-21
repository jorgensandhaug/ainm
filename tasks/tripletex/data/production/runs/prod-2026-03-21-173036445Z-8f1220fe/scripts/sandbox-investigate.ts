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
  // 1. Check divisions
  console.log("=== DIVISIONS ===");
  const divRes = await api("GET", "/division?count=10&fields=*");
  console.log("Divisions count:", divRes.data?.values?.length);
  if (divRes.data?.values?.length > 0) {
    console.log("First division:", JSON.stringify(divRes.data.values[0], null, 2));
  }

  // 2. Check company info
  console.log("\n=== COMPANY ===");
  const compRes = await api("GET", "/company/with/me?fields=*");
  if (compRes.status === 200) {
    const co = compRes.data?.value;
    console.log("Company:", JSON.stringify({
      id: co?.id,
      name: co?.name,
      organizationNumber: co?.organizationNumber,
      type: co?.type,
    }, null, 2));
  }

  // 3. Can we read municipalities?
  console.log("\n=== MUNICIPALITY ===");
  const munRes = await api("GET", "/municipality?count=3&fields=*");
  console.log("Municipalities count:", munRes.data?.values?.length);
  if (munRes.data?.values?.length > 0) {
    console.log("First municipality:", JSON.stringify(munRes.data.values[0], null, 2));
  }

  // 4. Try creating a division with company data
  if (compRes.status === 200 && divRes.data?.values?.length === 0) {
    const co = compRes.data?.value;
    const orgNum = co?.organizationNumber;
    const mun = munRes.data?.values?.[0];
    if (orgNum && mun) {
      console.log("\n=== TRY DIVISION CREATE ===");
      const divCreateRes = await api("POST", "/division", {
        name: "Hovudavdeling",
        organizationNumber: orgNum,
        startDate: "2026-01-01",
        municipalityDate: "2026-01-01",
        municipality: { id: mun.id },
      });
      console.log("Division create:", JSON.stringify(divCreateRes.data, null, 2));
    }
  }

  // 5. Also check what the manual voucher path looks like (accounts)
  console.log("\n=== LEDGER ACCOUNTS ===");
  const accRes = await api("GET", "/ledger/account?number=5000,1920&fields=*");
  console.log("Accounts:", JSON.stringify(accRes.data?.values?.map((a: any) => ({ id: a.id, number: a.number, name: a.name })), null, 2));
}

main().catch(console.error);
