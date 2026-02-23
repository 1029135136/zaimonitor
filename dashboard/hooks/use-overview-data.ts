"use client";

import { useEffect, useState } from "react";
import type { OverviewResponse } from "@/lib/overview-types";

type UseOverviewDataResult = {
  data: OverviewResponse | null;
  error: string | null;
  isLoading: boolean;
};

export function useOverviewData(hours: string): UseOverviewDataResult {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/overview?${new URLSearchParams({ hours }).toString()}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as OverviewResponse;

        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load overview");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [hours]);

  return { data, error, isLoading };
}
