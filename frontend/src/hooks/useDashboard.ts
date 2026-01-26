import { useState, useEffect, useCallback } from 'react';
import { fetchDashboard, DashboardResponse } from '../services/dashboard';

export default function useDashboard(baseUrl = '') {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchDashboard(baseUrl);
      setData(json);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refresh: load } as const;
}
