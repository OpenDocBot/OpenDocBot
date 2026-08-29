import { useEffect, useState } from "react";

let officeReady = false;
let officeReadyPromise: Promise<void> | null = null;

const OFFICE_TIMEOUT_MS = 3000;

export function waitForOffice(): Promise<void> {
  if (officeReady) return Promise.resolve();
  if (officeReadyPromise) return officeReadyPromise;

  officeReadyPromise = new Promise((resolve) => {
    if (typeof Office === "undefined") {
      console.log("[opendocbot] Office.js not loaded — browser dev mode");
      resolve();
      return;
    }

    let resolved = false;
    const done = () => {
      if (!resolved) { resolved = true; officeReady = true; resolve(); }
    };

    const timeout = setTimeout(() => {
      console.log("[opendocbot] Office.onReady timed out — browser dev mode");
      done();
    }, OFFICE_TIMEOUT_MS);

    Office.onReady((info) => {
      clearTimeout(timeout);
      if (info.host) {
        console.log("[opendocbot] Office.js ready, host:", info.host);
      }
      done();
    });
  });

  return officeReadyPromise;
}

export function isInsideOffice(): boolean {
  return (
    typeof Office !== "undefined" &&
    Office.onReady !== undefined &&
    Office.context !== undefined &&
    Office.context.host !== undefined
  );
}

export type Host = "word" | "excel" | "powerpoint";

/**
 * Detect the current Office host. Uses `Office.context.host` which reports the
 * real host (Word/Excel/PowerPoint) in desktop, online, and web versions.
 * Falls back to "word" when running outside Office (browser dev mode / unit tests).
 */
export function getHost(): Host {
  if (!isInsideOffice()) return "word";
  const host = Office.context.host;
  if (host === Office.HostType.Excel) return "excel";
  if (host === Office.HostType.PowerPoint) return "powerpoint";
  return "word";
}

export function useOfficeReady(): boolean {
  const [ready, setReady] = useState(officeReady);

  useEffect(() => {
    waitForOffice().then(() => setReady(true));
  }, []);

  return ready;
}
