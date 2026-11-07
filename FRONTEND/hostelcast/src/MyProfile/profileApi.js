import { apiUrl } from "../apiUrl.js";

export async function profileRequest(url, options = {}) {
  const token = localStorage.getItem("hostelcast_token");
  const response = await fetch(apiUrl(url), {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Profile request failed.");
  return result;
}
