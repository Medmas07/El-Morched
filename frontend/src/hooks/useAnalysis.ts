"use client";

import { api } from "@/lib/api";
import { useAnalysisStore } from "@/store/analysis";

export function useAnalysis() {
  const setAOI = useAnalysisStore((s) => s.setAOI);
  const setMode = useAnalysisStore((s) => s.setMode);
  const setRunning = useAnalysisStore((s) => s.setRunning);
  const setData = useAnalysisStore((s) => s.setData);
  const setRiskResults = useAnalysisStore((s) => s.setRiskResults);
  const setLastAnalysisDurationSeconds = useAnalysisStore((s) => s.setLastAnalysisDurationSeconds);
  const flyTo = useAnalysisStore((s) => s.flyTo);
  const aoi = useAnalysisStore((s) => s.aoi);

  async function runAnalysis() {
    if (!aoi) return;

    setRunning(true);

    const startedAt = Date.now();
    try {
      const { run_id } = await api.analysis.run({
        bbox: aoi,
        weather_days_back: 7,
      });
      const result = await api.analysis.poll(run_id);

      const durationSeconds = (Date.now() - startedAt) / 1000;

      if (result.status !== "completed") {
        return;
      }

      const normalizedImages = (result.images ?? [])
        .filter((img) => img.url && img.url.trim() !== "")
        .map((img) => ({
          id: img.id,
          url: img.url,
          lat: img.lat,
          lon: img.lon,
        }));

      const trajectoryFromResult =
        result.trajectory?.map((point, index) => ({
          lat: point.lat,
          lon: point.lon,
          elevation: point.elevation ?? 0,
          image_id: point.image_id ?? normalizedImages[index]?.id ?? `pt-${index}`,
        })) ??
        normalizedImages.map((img) => ({
          lat: img.lat,
          lon: img.lon,
          elevation: 0,
          image_id: img.id,
        }));

      setRiskResults(result.flood_layers ?? [], result.heat_layers ?? []);
      setLastAnalysisDurationSeconds(durationSeconds);
      setAOI(aoi);
      if (normalizedImages.length > 0) {
        setData({
          trajectory: trajectoryFromResult,
          images: normalizedImages,
          profile: [],
        });
        setMode("advanced");
      }
      flyTo({
        lat: (aoi.north + aoi.south) / 2,
        lon: (aoi.east + aoi.west) / 2,
        zoom: 13,
      });
    } finally {
      setRunning(false);
    }
  }

  return { runAnalysis };
}
