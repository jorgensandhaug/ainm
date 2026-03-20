const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const employeeId = Number(process.argv[2]);
const year = Number(process.argv[3] ?? "2026");
const outputPath = process.argv[4];

if (!employeeId || !outputPath) {
  console.error("usage: bun sandbox_download_compilation_pdf.ts <employeeId> <year> <outputPath>");
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const url = new URL(`salary/compilation/pdf?employeeId=${employeeId}&year=${year}`, `${BASE_URL}/`);

const response = await fetch(url, {
  headers: {
    Authorization: authHeader,
    Accept: "application/octet-stream,application/json",
  },
});

const buffer = Buffer.from(await response.arrayBuffer());
await Bun.write(outputPath, buffer);
console.log(JSON.stringify({ status: response.status, bytes: buffer.length, outputPath }, null, 2));
