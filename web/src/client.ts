import type { Config, Item, Kind } from "./domain";
export let config: Config;
const TOKEN_KEY = "morrowfold-pilot-session";
let token = "";
export async function configure() {
  const r = await fetch("./config.json", { cache: "no-store" });
  if (!r.ok) throw Error("The workspace configuration could not be loaded.");
  config = await r.json();
  if (
    config.mode === "live" &&
    (!config.apiUrl || !config.apiUrl.startsWith("https://"))
  )
    throw Error("The pilot needs a secure API connection.");
  token = sessionStorage.getItem(TOKEN_KEY) || "";
}
export async function signedIn() {
  return config.mode === "preview" || !!token;
}
export async function login(code: string) {
  token = code.trim();
  try {
    await api.list();
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    token = "";
    throw e;
  }
}
export async function logout() {
  token = "";
  sessionStorage.removeItem(TOKEN_KEY);
  location.reload();
}
async function call(path: string, method = "GET", body?: unknown) {
  if (!token) throw Error("Please enter your pilot access code.");
  const res = await fetch(config.apiUrl.replace(/\/$/, "") + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      token = "";
    }
    let detail = "Something went wrong. Please try again.";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {}
    throw Error(detail);
  }
  return res.status === 204 ? null : res.json();
}
export const api = {
  list: (): Promise<Item[]> => call("/v1/items"),
  save: (
    kind: Kind,
    data: Item["data"],
    id?: string,
    version?: number,
  ): Promise<Item> =>
    call("/v1/items" + (id ? `/${id}` : ""), id ? "PUT" : "POST", {
      kind,
      data,
      version,
    }),
  remove: (i: Item) => call(`/v1/items/${i.id}?version=${i.version}`, "DELETE"),
  chat: (
    message: string,
    area_id: string | null,
    conversation_id: string | null,
  ) => call("/v1/chat", "POST", { message, area_id, conversation_id }),
  draft: (area_id: string, job: string) =>
    call("/v1/drafts", "POST", { area_id, job }),
};
