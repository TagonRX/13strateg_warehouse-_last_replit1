import type { User, InventoryItem } from "@shared/schema";

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    login: string;
    role: string;
  };
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
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
