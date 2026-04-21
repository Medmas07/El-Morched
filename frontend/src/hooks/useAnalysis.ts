"use client";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { useAnalysisStore } from "@/store/analysis";

export function useAnalysis() {
  const { bbox, setRunId, setResult, setImages } = useAnalysisStore();

  const runAnalysis = useCallback(async () => {
    if (!bbox) return;

    // Fetch images in parallel with analysis
    const [{ run_id, status }] = await Promise.all([
      api.analysis.run({ bbox, weather_days_back: 7 }),
      api.mapillary.images(bbox.west, bbox.south, bbox.east, bbox.north).then(setImages),
    ]);

    setRunId(run_id, status);

    // Poll until complete
    const result = await api.analysis.poll(run_id);
    setResult(result);
  }, [bbox, setRunId, setResult, setImages]);

  return { runAnalysis };
}
