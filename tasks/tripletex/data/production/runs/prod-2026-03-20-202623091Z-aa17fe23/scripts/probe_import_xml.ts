const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const xmlPath =
  "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-202623091Z-aa17fe23/scripts/minimal-invoice.xml";

function makeUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
  return url.toString();
}

const xmlBytes = await Bun.file(xmlPath).arrayBuffer();
const form = new FormData();
form.append("description", "probe-xml-import");
form.append("file", new Blob([xmlBytes], { type: "application/xml" }), "minimal-invoice.xml");

const response = await fetch(makeUrl("ledger/voucher/importDocument"), {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
    Accept: "application/json",
  },
  body: form,
});

const text = await response.text();
const data = text ? JSON.parse(text) : null;

console.log(
  JSON.stringify(
    {
      status: response.status,
      ok: response.ok,
      body: data,
    },
    null,
    2,
  ),
);
