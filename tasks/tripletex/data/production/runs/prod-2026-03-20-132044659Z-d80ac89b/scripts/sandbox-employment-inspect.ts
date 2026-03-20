const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

async function api(path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text}`);
  return text ? JSON.parse(text) : null;
}

const employment = await api("/employee/employment/2737172?fields=*");
console.log(JSON.stringify(employment, null, 2));
