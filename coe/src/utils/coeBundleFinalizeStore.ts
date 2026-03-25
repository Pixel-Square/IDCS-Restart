export type BundleFinalizeConfig = {
  finalized: boolean;
  bundleSize: number;
  finalizedAt: string;
};

export type BundleFinalizeMap = Record<string, BundleFinalizeConfig>;

const BUNDLE_FINALIZE_STORAGE_KEY = 'coe-bundle-finalize-v1';

export const getBundleFinalizeKey = (department: string, semester: string) => `${department}::${semester}`;

export const readBundleFinalizeMap = (): BundleFinalizeMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BUNDLE_FINALIZE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BundleFinalizeMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeBundleFinalizeMap = (data: BundleFinalizeMap) => {
  if (typeof window === 'undefined') return;
  const keys = Object.keys(data || {});
  if (keys.length === 0) {
    window.localStorage.removeItem(BUNDLE_FINALIZE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(BUNDLE_FINALIZE_STORAGE_KEY, JSON.stringify(data));
};

export const getBundleFinalizeConfig = (department: string, semester: string): BundleFinalizeConfig | null => {
  const key = getBundleFinalizeKey(department, semester);
  return readBundleFinalizeMap()[key] || null;
};

export const setBundleFinalizeConfig = (department: string, semester: string, config: BundleFinalizeConfig) => {
  const key = getBundleFinalizeKey(department, semester);
  const map = readBundleFinalizeMap();
  map[key] = config;
  writeBundleFinalizeMap(map);
};

export const clearBundleFinalizeConfig = (department: string, semester: string) => {
  const key = getBundleFinalizeKey(department, semester);
  const map = readBundleFinalizeMap();
  if (!map[key]) return;
  delete map[key];
  writeBundleFinalizeMap(map);
};

export const listFinalizedBundleConfigs = (): Array<{ department: string; semester: string; bundleSize: number }> => {
  const map = readBundleFinalizeMap();
  return Object.entries(map)
    .map(([key, value]) => {
      const [department, semester] = key.split('::');
      return {
        department: String(department || ''),
        semester: String(semester || ''),
        bundleSize: Number(value?.bundleSize || 0),
        finalized: Boolean(value?.finalized),
      };
    })
    .filter((row) => row.finalized && row.department && row.semester && row.bundleSize > 0)
    .map(({ department, semester, bundleSize }) => ({ department, semester, bundleSize }));
};
