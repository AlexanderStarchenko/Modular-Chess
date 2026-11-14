// Default configuration for web/browser environment
const MobileConfig = {
    serverUrl: null
};
if (typeof window !== 'undefined') window.MobileConfig = MobileConfig;
if (typeof globalThis !== 'undefined') globalThis.MobileConfig = MobileConfig;
