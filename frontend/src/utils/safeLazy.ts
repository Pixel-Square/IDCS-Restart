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
      
      if (!module.default) {
        console.error(`[SafeLazy] No default export found in ${componentName}`, module);
        throw new Error(`Component ${componentName} has no default export`);
      }
      
      if (typeof module.default !== 'function') {
        console.error(`[SafeLazy] Default export is not a function in ${componentName}:`, typeof module.default, module.default);
        throw new Error(`Component ${componentName} default export is not a valid React component`);
      }
      
      return module;
    } catch (error) {
      console.error(`[SafeLazy] Failed to load ${componentName}:`, error);
      throw error;
    }
  });
}
