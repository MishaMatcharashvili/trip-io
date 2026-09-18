// Kept out of the "use client" module: the root layout (a Server Component)
// needs the script as a plain string, not a client reference.

export const STORAGE_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before first paint. It resolves the stored preference —
 * falling back to the OS — to a concrete `data-theme`, so the CSS only ever
 * has to know about two themes and there is no flash of the wrong one.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("${DARK_QUERY}").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;
