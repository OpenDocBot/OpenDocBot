/**
 * Open the OAuth authorization dialog. Inside Office, uses the Dialog API
 * (same-origin start page → AS → same-origin callback, which `messageParent`s
 * the final redirect URL). Outside Office, falls back to a popup that posts the
 * redirect URL back via `postMessage`.
 */
export function openAuthDialog(authUrl: string): Promise<string> {
  // The Office Dialog API only opens same-origin URLs, so we open our own
  // start page, which redirects to the authorization server.
  const startUrl = `${location.origin}/auth/mcp.html?auth=${encodeURIComponent(authUrl)}`;
  if (typeof Office !== "undefined" && Office.context?.ui) {
    return openOfficeDialogWithFallback(startUrl);
  }
  return openPopup(startUrl);
}

class AuthDialogError extends Error {
  constructor(
    message: string,
    readonly dialogOpened: boolean,
  ) {
    super(message);
    this.name = "AuthDialogError";
  }
}

/**
 * Avoid Office's "wants to display a new window" prompt by opening with
 * `promptBeforeOpen: false`. The click gesture is still active, so the popup is
 * normally allowed; if it is blocked the dialog never opens, so retry once with
 * the framework prompt.
 */
async function openOfficeDialogWithFallback(url: string): Promise<string> {
  try {
    return await openOfficeDialog(url, false);
  } catch (err) {
    if (err instanceof AuthDialogError && !err.dialogOpened) {
      return await openOfficeDialog(url, true);
    }
    throw err;
  }
}

function openOfficeDialog(url: string, promptBeforeOpen: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      url,
      { height: 70, width: 45, displayInIframe: false, promptBeforeOpen },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Failed) {
          reject(
            new AuthDialogError(
              `Could not open the authorization dialog: ${result.error?.message ?? ""}`,
              false,
            ),
          );
          return;
        }
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (args) => {
          try {
            const message = JSON.parse((args as { message: string }).message) as {
              redirect?: string;
            };
            dialog.close();
            if (!message.redirect) throw new Error("Authorization dialog returned no redirect.");
            resolve(message.redirect);
          } catch (err) {
            reject(err as Error);
          }
        });
        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
          reject(new Error("Authorization dialog closed before completing."));
        });
      },
    );
  });
}

function openPopup(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const popup = window.open(url, "mcp-oauth", "width=520,height=680");
    if (!popup) {
      reject(new Error("The authorization popup was blocked. Allow popups and try again."));
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      const data = event.data as { redirect?: string } | undefined;
      if (!data?.redirect) return;
      window.removeEventListener("message", onMessage);
      resolve(data.redirect);
    };
    window.addEventListener("message", onMessage);
  });
}
