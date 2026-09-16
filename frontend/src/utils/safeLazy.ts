import React from 'react';

/**
 * Wraps React.lazy() with enhanced error logging
 * Helps identify which lazy-loaded component is failing
 */
export function safeLazy(
  importFn: () => Promise<{ default: React.ComponentType<any> }>,
  componentName: string
) {
  return React.lazy(async () => {
    try {
      console.log(`[SafeLazy] Loading component: ${componentName}`);
      const module = await importFn();
      console.log(`[SafeLazy] Successfully loaded: ${componentName}`);

      const component = module?.default || (module as any)?.[componentName] || module;

      if (!component) {
        console.error(`[SafeLazy] No default export found in ${componentName}`, module);
        throw new Error(`Component ${componentName} has no default export`);
      }

      if (typeof component !== 'function' && typeof (component as any)?.$$typeof !== 'symbol') {
        console.error(`[SafeLazy] Default export is not a function in ${componentName}:`, typeof component, component);
        throw new Error(`Component ${componentName} default export is not a valid React component`);
      }

      return { default: component };
    } catch (error: any) {
      console.error(`[SafeLazy] Failed to load ${componentName}:`, error);

      // Recoverable Vite/webpack chunk-load failures (stale hashed chunk after
      // a redeploy, flaky network): retry the dynamic import once so the user
      // is not left on a blank page.
      const isChunkError =
          error?.message?.includes('Failed to fetch dynamically imported module') ||
          error?.message?.includes('Importing a module script failed') ||
          error?.message?.includes('error loading dynamically imported module') ||
          error?.name === 'ChunkLoadError';

      if (isChunkError) {
        console.info(`[SafeLazy] Retrying load of ${componentName} after chunk error`);
        const module = await importFn();
        const component =
          (module as any)?.default || (module as any)?.[componentName] || module;
        if (component && (typeof component === 'function' || typeof (component as any)?.$$typeof === 'symbol')) {
          return { default: component };
        }
      }

      // Non-recoverable: rethrow so the nearest error boundary renders a
      // visible fallback instead of a blank screen.
      throw error;
    }
  });
}
