import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small data-loading hook.
 *
 * @param {Function} fetcher  - Async function that returns data.
 * @param {Array}    deps     - Dependency list that triggers a reload.
 * @param {*}        initial  - Optional initial data (e.g. from a local cache).
 *                             When provided the hook starts with loading=false so
 *                             the UI renders immediately with stale data, then
 *                             silently refreshes in the background.
 */
export function useFetch(fetcher, deps = [], initial = null) {
  const [data, setData] = useState(initial);
  // If we have initial data we don't need to show a loading spinner.
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    // Only show the full loading spinner when we have no data at all.
    if (mounted.current && data === null) setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mounted.current) {
        setData(result);
        setLoading(false);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err.message || "Failed to load data.");
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}
