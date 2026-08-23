/**
 * Stub for the `server-only` package, used by the verification scripts.
 *
 * `server-only` throws at import time outside a React Server Component, which
 * is the whole point of it — but it also means a plain `tsx` script cannot
 * import any of our `src/lib/*` modules that are marked server-only, even
 * though those are exactly the modules whose behaviour needs verifying.
 *
 * `tsconfig.script.json` maps the module name here. Nothing in the app build
 * sees this file.
 */
export {};
