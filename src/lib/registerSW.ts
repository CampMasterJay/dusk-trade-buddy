export async function initServiceWorker() {
  if (typeof window === "undefined") return;

  const isDev = !import.meta.env.PROD;
  const isIframe = window.self !== window.top;
  const hostname = window.location.hostname;
  const isPreview =
    hostname.startsWith("id-preview--") || hostname.startsWith("preview--");
  const isLovableProject =
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com");
  const isLovableDev =
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com");
  const isBetaLovable =
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev");
  const hasSwOff = window.location.search.includes("sw=off");

  const shouldRegister =
    !isDev &&
    !isIframe &&
    !isPreview &&
    !isLovableProject &&
    !isLovableDev &&
    !isBetaLovable &&
    !hasSwOff;

  if (!shouldRegister) {
    // Unregister any existing app shell SWs in dev/preview contexts
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          if (reg.scope && reg.scope.includes(window.location.origin)) {
            reg.unregister();
          }
        }
      });
    }
    return;
  }

  const { registerSW } = await import("virtual:pwa-register");
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
    onOfflineReady() {
      console.log("[PWA] App ready to work offline");
    },
  });
}
