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

      // Handle Vite chunk hash mismatch after a new build / deployment
      const isChunkError =
          error?.message?.includes('Failed to fetch dynamically imported module') ||
          error?.message?.includes('Importing a module script failed') ||
          error?.message?.includes('error loading dynamically imported module') ||
          error?.name === 'ChunkLoadError';

        // Graceful fallback UI – render a simple error placeholder.
        console.error(`[SafeLazy] Chunk load error for ${componentName}:`, error);
        const Fallback: React.FC = () => React.createElement(
          'div',
          { style: { padding: '2rem', textAlign: 'center', color: 'red' } },
          `Failed to load ${componentName}. Please refresh the page.`
        );
        return { default: Fallback };

      throw error;
    }
  });
}
