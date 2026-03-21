const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Check the invoice we just created
const res = await fetch(`${BASE}/invoice/2147644708?fields=*,customer(*),orderLines(*),orders(*,orderLines(*))`, { headers: H });
const data = await res.json();
console.log("Invoice:", JSON.stringify(data.value, null, 2).substring(0, 2000));
