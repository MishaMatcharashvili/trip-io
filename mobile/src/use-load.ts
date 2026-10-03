import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { messageOf } from "~/api";

export type Loaded<T> = {
  data: T | null;
  /** What to tell the traveller, when the last load failed. */
  error: string | null;
  /** The first load, before there is anything to show. */
  loading: boolean;
  /** A reload with something already on screen (pull to refresh). */
  refreshing: boolean;
  refresh: () => void;
};

/**
 * One screen's read. It loads when the screen takes focus, so a card answered
 * on another screen, or a setting changed, is what the screen behind it shows
 * when it is back. A failed reload keeps what was on screen and says it failed.
 */
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  // A response that lands after a newer request was made is stale.
  const latest = useRef(0);

  const run = useCallback(async (pulled: boolean) => {
    const mine = ++latest.current;
    if (pulled) setRefreshing(true);
    try {
      const next = await loadRef.current();
      if (mine !== latest.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (mine !== latest.current) return;
      setError(messageOf(e));
    } finally {
      if (mine === latest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void run(false);
    }, [run]),
  );

  const refresh = useCallback(() => void run(true), [run]);
  return { data, error, loading, refreshing, refresh };
}
