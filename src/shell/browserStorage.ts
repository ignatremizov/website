function getBrowserStorage(
  name: "localStorage" | "sessionStorage",
): Storage | null {
  try {
    return window[name];
  } catch {
    return null;
  }
}

export function getLocalStorage(): Storage | null {
  return getBrowserStorage("localStorage");
}

export function getSessionStorage(): Storage | null {
  return getBrowserStorage("sessionStorage");
}
