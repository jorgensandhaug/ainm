/**
 * 69-task20-physical-address.ts
 *
 * Verify that POST /supplier accepts both postalAddress and physicalAddress
 * with country field (testing both country: "NO" string and country: { id: 161 } object).
 * Then GET /supplier/{id}?fields=* to confirm both addresses are stored.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  const ts = Date.now();

  // Test 1: country as string "NO"
  console.log("=== Test 1: country as string 'NO' ===");
  const supplier1 = {
    name: `PhysAddrTest-String-${ts}`,
    organizationNumber: "123456785",
    postalAddress: {
      addressLine1: "Testveien 1",
      postalCode: "0150",
      city: "Oslo",
      country: "NO",
    },
    physicalAddress: {
      addressLine1: "Testveien 1",
      postalCode: "0150",
      city: "Oslo",
      country: "NO",
    },
  };
  const r1 = await api("POST", "/supplier", supplier1);
  console.log("POST status:", r1.status);
  if (r1.status >= 400) {
    console.log("POST failed:", JSON.stringify(r1.json, null, 2));
  }

  // Test 2: country as object { id: 161 }
  console.log("\n=== Test 2: country as object { id: 161 } ===");
  const supplier2 = {
    name: `PhysAddrTest-Object-${ts}`,
    organizationNumber: "123456785",
    postalAddress: {
      addressLine1: "Testveien 2",
      postalCode: "0150",
      city: "Oslo",
      country: { id: 161 },
    },
    physicalAddress: {
      addressLine1: "Testveien 2",
      postalCode: "0150",
      city: "Oslo",
      country: { id: 161 },
    },
  };
  const r2 = await api("POST", "/supplier", supplier2);
  console.log("POST status:", r2.status);
  if (r2.status >= 400) {
    console.log("POST failed:", JSON.stringify(r2.json, null, 2));
  }

  // Now verify whichever succeeded
  for (const [label, result] of [
    ["String 'NO'", r1],
    ["Object {id:161}", r2],
  ] as const) {
    if (result.status === 201) {
      const id = result.json.value.id;
      console.log(`\n=== GET supplier for ${label} (id=${id}) ===`);
      const g = await api("GET", `/supplier/${id}?fields=*`);
      console.log("GET status:", g.status);
      const s = g.json.value;

      // Fetch the expanded address objects
      if (s.postalAddress?.id) {
        const pa = await api("GET", `/address/${s.postalAddress.id}?fields=*`);
        console.log("postalAddress:", JSON.stringify(pa.json.value, null, 2));
      } else {
        console.log("postalAddress: not set");
      }
      if (s.physicalAddress?.id) {
        const pha = await api("GET", `/address/${s.physicalAddress.id}?fields=*`);
        console.log("physicalAddress:", JSON.stringify(pha.json.value, null, 2));
      } else {
        console.log("physicalAddress: not set");
      }

      console.log(
        `\n${label} -> postalAddress id: ${s.postalAddress?.id}, physicalAddress id: ${s.physicalAddress?.id}`
      );
    } else {
      console.log(`\n${label} -> POST failed (${result.status}), skipping GET`);
    }
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);
