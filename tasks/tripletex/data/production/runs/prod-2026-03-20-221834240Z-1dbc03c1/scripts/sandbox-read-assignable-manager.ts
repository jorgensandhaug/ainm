const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function buildUrl(pathWithQuery: string): string {
  return new URL(pathWithQuery, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

async function api(pathWithQuery: string): Promise<Response> {
  return fetch(buildUrl(pathWithQuery), {
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`,
      Accept: "application/json",
    },
  });
}

const response = await api("employee?email=simen.sandhaug@gmail.com&assignableProjectManagers=true&count=10&fields=*");
const body = await response.json();
console.log(JSON.stringify(body, null, 2));
