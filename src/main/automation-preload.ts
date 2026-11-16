import { ipcRenderer } from "electron";

const origin = window.location.origin;
if (origin === "http:" || origin === "https:" || origin.startsWith("http://") || origin.startsWith("https://")) {
  try {
    const stored = ipcRenderer.sendSync("asura:profile:session-storage", "read") as string;
    const values = JSON.parse(stored) as Record<string, unknown>;
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string") window.sessionStorage.setItem(key, value);
    }
  } catch (error) {
    console.error("Could not restore isolated browser session storage:", error);
  }

  window.addEventListener("pagehide", () => {
    try {
      const values: Record<string, string> = {};
      for (let index = 0; index < window.sessionStorage.length; index++) {
        const key = window.sessionStorage.key(index);
        if (key !== null) values[key] = window.sessionStorage.getItem(key) ?? "";
      }
      ipcRenderer.sendSync("asura:profile:session-storage", "write", values);
    } catch (error) {
      console.error("Could not persist isolated browser session storage:", error);
    }
  });
}
