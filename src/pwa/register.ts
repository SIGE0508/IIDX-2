/** Browser-only registration. No storage changes or forced reloads. */
export function registerPwa(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const base = import.meta.env.BASE_URL;
  void navigator.serviceWorker.register(`${base}sw.js`, {
    scope: base, updateViaCache: "none",
  }).then(registration => {
    const check = () => {
      if (navigator.onLine) void registration.update().catch(error => console.warn("PWA更新確認を保留しました", error));
    };
    check();
    window.addEventListener("online", check);
    // A waiting worker is activated naturally once all clients close.
    // Expose an event for a future optional update notice, not an auto reload.
    const announce = () => window.dispatchEvent(new Event("pwa-update-ready"));
    if (registration.waiting) announce();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) announce();
      });
    });
  }).catch(error => console.warn("PWA登録を保留しました。通常機能は引き続き利用できます", error));
}
