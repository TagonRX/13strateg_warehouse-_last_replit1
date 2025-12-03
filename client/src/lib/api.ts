import type { User, InventoryItem } from "@shared/schema";

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    login: string;
    role: string;
    requiresPasswordChange?: boolean;
  };
}

const AUTH_TOKEN_KEY = "auth_token";

let authToken: string | null = localStorage.getItem(AUTH_TOKEN_KEY);

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem(AUTH_TOKEN_KEY);
  }
  return authToken;
}

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  
  return headers;
}

export async function login(login: string, password: string): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Login failed");
  }

  const data = await response.json();
  setAuthToken(data.token);
  return data;
}

export async function getCurrentUser(): Promise<{
  id: string;
  name: string;
  login: string;
  role: string;
  requiresPasswordChange?: boolean;
}> {
  const response = await fetch("/api/auth/me", {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get current user");
  }

  return response.json();
}

export async function getAllInventory(): Promise<InventoryItem[]> {
  const response = await fetch("/api/inventory", {
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch inventory");
  }

  return response.json();
}

export async function createInventoryItem(
  item: {
    productId?: string;
    name?: string;
    sku: string;
    location: string;
    quantity: number;
    barcode?: string;
    price?: number;
  }
): Promise<InventoryItem> {
  const response = await fetch("/api/inventory", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ ...item, status: "IN_STOCK" }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create item");
  }

  return response.json();
}

export async function bulkUploadInventory(
  items: Array<{
    productId?: string;
    name?: string;
    sku: string;
    location: string;
    quantity: number;
    barcode?: string;
  }>
): Promise<{ success: number; updated: number; errors: number }> {
  const formattedItems = items.map(item => ({
    ...item,
    status: "IN_STOCK",
  }));

  const response = await fetch("/api/inventory/bulk-upload", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ items: formattedItems }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload");
  }

  return response.json();
}

export async function getWarehouseLoading(): Promise<{
  location: string;
  skuCount: number;
  totalQuantity: number;
  items: { sku: string; name: string; quantity: number; barcode?: string; id: string }[];
}[]> {
  const response = await fetch("/api/warehouse/loading", {
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch warehouse loading");
  }

  return response.json();
}

export async function pickItemByBarcode(barcode: string): Promise<InventoryItem> {
  const response = await fetch("/api/inventory/pick", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ barcode }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to pick item");
  }

  return response.json();
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const response = await fetch(`/api/inventory/item/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete item");
  }
}

export async function batchDeleteInventoryItems(ids: string[]): Promise<{
  deleted: string[];
  failed: Array<{ id: string; error: string }>;
}> {
  const response = await fetch("/api/inventory/batch-delete", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to batch delete items");
  }

  return response.json();
}

export async function deleteLocation(location: string): Promise<{ deleted: number }> {
  const response = await fetch(`/api/inventory/location/${encodeURIComponent(location)}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete location");
  }

  return response.json();
}

export async function getAllUsers(): Promise<Omit<User, "password">[]> {
  const response = await fetch("/api/users", {
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch users");
  }

  return response.json();
}

export async function createUser(user: {
  name: string;
  login: string;
  password: string;
  role: string;
}): Promise<Omit<User, "password">> {
  const response = await fetch("/api/users", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(user),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create user");
  }

  return response.json();
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`/api/users/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete user");
  }
}

export async function updateUserPassword(id: string, password: string): Promise<void> {
  const response = await fetch(`/api/users/${id}/password`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update password");
  }
}

export async function updateUserName(id: string, name: string): Promise<Omit<User, "password">> {
  const response = await fetch(`/api/users/${id}/name`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update user name");
  }

  return response.json();
}

export async function updateUserLogin(id: string, login: string): Promise<Omit<User, "password">> {
  const response = await fetch(`/api/users/${id}/login`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify({ login }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update user login");
  }

  return response.json();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to change password");
  }

  return response.json();
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    headers: getHeaders(),
  });

  if (!response.ok) {
    console.error("Logout request failed, but clearing local token anyway");
  }
  
  setAuthToken(null);
}

export async function getEventLogs(limit?: number): Promise<any[]> {
  const url = limit ? `/api/logs?limit=${limit}` : "/api/logs";
  const response = await fetch(url, {
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch logs");
  }

  return response.json();
}

// =============== eBay Integration API (Admin) ===============
export interface EbayAccount {
  id: string;
  label: string;
  siteId?: string | null;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string | null;
  accessTokenExpiresAt?: string | null;
  enabled: boolean;
  lastOrdersSince?: string | null;
  lastInventorySince?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getEbayAccounts(): Promise<EbayAccount[]> {
  const response = await fetch("/api/integrations/ebay/accounts", {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error("Не удалось получить список аккаунтов eBay");
  return response.json();
}

export async function createEbayAccount(input: {
  label: string;
  siteId?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  enabled?: boolean;
}): Promise<EbayAccount> {
  const response = await fetch("/api/integrations/ebay/accounts", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Ошибка создания аккаунта eBay");
  return data;
}

export async function updateEbayAccount(id: string, updates: Partial<{
  label: string;
  siteId?: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  enabled: boolean;
  lastOrdersSince?: string | null;
  lastInventorySince?: string | null;
}>): Promise<EbayAccount> {
  const response = await fetch(`/api/integrations/ebay/accounts/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Ошибка обновления аккаунта eBay");
  return data;
}

export async function testEbayAccount(id: string): Promise<{ ok: boolean; tokenExpiresAt?: string; error?: string }>{
  const response = await fetch(`/api/integrations/ebay/accounts/${id}/test`, {
    method: "POST",
    headers: getHeaders(),
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) throw new Error(data?.error || "Тест аккаунта не выполнен");
  return data;
}

export async function pullEbayOrders(): Promise<{ ok: boolean; result?: any; error?: string }>{
  const response = await fetch("/api/integrations/ebay/pull-orders", {
    method: "POST",
    headers: getHeaders(),
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) throw new Error(data?.error || "Ошибка загрузки заказов eBay");
  return data;
}

export async function pullEbayOrdersWorker(): Promise<{ ok: boolean; result?: any; error?: string }>{
  const response = await fetch("/api/integrations/ebay/pull-orders-worker", {
    method: "POST",
    headers: getHeaders(),
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) throw new Error(data?.error || "Ошибка загрузки заказов eBay");
  return data;
}

export async function pullEbayInventory(): Promise<{ ok: boolean; result?: any; error?: string }>{
  const response = await fetch("/api/integrations/ebay/pull-inventory", {
    method: "POST",
    headers: getHeaders(),
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) throw new Error(data?.error || "Ошибка загрузки инвентаря eBay");
  return data;
}

export async function createPickingListFromEbay(): Promise<{ id: string; name: string }>{
  const response = await fetch("/api/integrations/ebay/create-picking-list", {
    method: "POST",
    headers: getHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Ошибка создания листа отбора");
  return data;
}

// Effective ATP for a specific account (applies safety buffer)
export async function getEffectiveATPForAccount(accountId: string): Promise<{ accountId: string; list: Array<{ sku: string; onHand: number; reserved: number; buffer: number; effective: number }> }>{
  const response = await fetch(`/api/inventory/atp/effective?accountId=${encodeURIComponent(accountId)}`, {
    headers: getHeaders(),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Ошибка получения эффективного ATP");
  return data;
}

export async function pushEbayInventory(accountId: string): Promise<{ ok: boolean; updated: number; errors: number; pushed: number; total: number }>{
  const response = await fetch("/api/integrations/ebay/push-inventory", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ accountId }),
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) throw new Error(data?.error || "Ошибка пуша инвентаря");
  return data;
}
