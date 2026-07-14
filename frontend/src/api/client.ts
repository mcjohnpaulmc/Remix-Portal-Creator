/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const TOKEN_KEY = "mobius_admin_token";

export function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY);
  const { headers, ...rest } = init;
  return fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export function publicFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { headers, ...rest } = init;
  return fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string> | undefined),
    },
  });
}

export function storeAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
