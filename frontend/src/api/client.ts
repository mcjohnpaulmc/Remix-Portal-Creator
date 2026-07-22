/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    },
  });
  if (response.status === 401) {
    alert("Your session has expired. Please log in again.");
    window.location.reload();
  }
  return response;
}

export function publicFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { headers, ...rest } = init;
  return fetch(url, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    },
  });
}

// No-ops — JWT is now delivered as an HttpOnly cookie, not stored in localStorage
export function storeAuthToken(_token: string): void {}
export function clearAuthToken(): void {}
