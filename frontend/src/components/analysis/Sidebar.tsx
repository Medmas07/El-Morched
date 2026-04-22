"use client";

import { useMemo, useEffect } from "react";
import { useAnalysisStore } from "@/store/analysis";
import { api } from "@/lib/api";

export default function Sidebar() {
  const mode = useAnalysisStore((s) => s.mode);
  const setMode = useAnalysisStore((s) => s.setMode);
  const aoi = useAnalysisStore((s) => s.aoi);
  const drawnPath = useAnalysisStore((s) => s.drawnPath);
  const isRunning = useAnalysisStore((s) => s.isRunning);
  const activeLayer = useAnalysisStore((s) => s.activeLayer);
  const floodLayers = useAnalysisStore((s) => s.floodLayers);
  const setRunning = useAnalysisStore((s) => s.setRunning);
  const setRiskResults = useAnalysisStore((s) => s.setRiskResults);
  const setActiveLayer = useAnalysisStore((s) => s.setActiveLayer);
  const setAOI = useAnalysisStore((s) => s.setAOI);
  const pathWidthMeters = useAnalysisStore((s) => s.pathWidthMeters);
  const setPathWidthMeters = useAnalysisStore((s) => s.setPathWidthMeters);
  const setData = useAnalysisStore((s) => s.setData);

  const hasResults = floodLayers.length > 0;

  const aoiLabel = useMemo(() => {
    if (!aoi) return "No path drawn";
    const spanLat = ((aoi.north - aoi.south) * 111).toFixed(1); // rough km
    const spanLon = ((aoi.east - aoi.west) * 111).toFixed(1);
    return `${spanLat} × ${spanLon} km  (${aoi.south.toFixed(4)}, ${aoi.west.toFixed(4)})`;
  }, [aoi]);

  // Helper to fetch mapillary images (trying along path first, fallback to BBox logic)
  async function fetchMapillaryImages(path: any, widthMeters: number, aoiBox: any) {
    if (!path || path.length < 2) return [];
    
    // First try the strict path query
    let sortedImgs = await api.mapillary.imagesAlongPath(path, widthMeters).catch(() => []);
    
    // Fallback if no images found exactly along path (like it used to do)
    if (sortedImgs.length === 0 && aoiBox) {
      console.log("No images along exact path, falling back to bounding box query");
      const imgs = await api.mapillary.images(
        aoiBox.west, aoiBox.south, aoiBox.east, aoiBox.north
      ).catch(() => []);
      
      sortedImgs = imgs.length <= 1
        ? imgs
        : (() => {
            const sorted = [imgs[0]];
            const remaining = imgs.slice(1);

            while (remaining.length) {
              const last = sorted[sorted.length - 1];
              let nearestIdx = 0;
              let nearestDist = Infinity;

              remaining.forEach((img: any, i: number) => {
                const d = Math.hypot(img.lat - last.lat, img.lon - last.lon);
                if (d < nearestDist) {
                  nearestDist = d;
                  nearestIdx = i;
                }
              });

              sorted.push(remaining.splice(nearestIdx, 1)[0]);
            }
            return sorted;
          })();
    }
    return sortedImgs;
  }

  // Refetch mapillary images when path width changes in advanced mode
  useEffect(() => {
    if (mode !== "advanced" || !hasResults || !drawnPath || drawnPath.length < 2) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        const sortedImgs = await fetchMapillaryImages(drawnPath, pathWidthMeters, aoi);
        setData({
          trajectory: sortedImgs.map((img: any) => ({
            lat: img.lat,
            lon: img.lon,
            elevation: 0,
            image_id: img.id,
          })),
          images: sortedImgs.map((img: any) => ({
            id: img.id,
            lat: img.lat,
            lon: img.lon,
            url:
              img.thumb_url ??
              `https://placehold.co/1200x700/0f172a/ffffff?text=No+Mapillary+Image+Found`,
          })),
          profile: [],
        });
      } catch (err) {
        console.error("Failed to refetch mapillary images on width change:", err);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [pathWidthMeters, mode, hasResults, drawnPath, aoi, setData]);

  async function onRunAnalysis() {
    if (isRunning || !aoi) return;
    setRunning(true);
    try {
      const { run_id } = await api.analysis.run({
        bbox: aoi,
        weather_days_back: 7,
      });
      const result = await api.analysis.poll(run_id);

      if (result.status === "completed") {
        setRiskResults(result.flood_layers, result.heat_layers);

        const sortedImgs = await fetchMapillaryImages(drawnPath, pathWidthMeters, aoi);

        console.log("flood layers:", result.flood_layers.length);

        setData({
          trajectory: sortedImgs.map((img: any) => ({
            lat: img.lat,
            lon: img.lon,
            elevation: 0,
            image_id: img.id,
          })),
          images: sortedImgs.map((img: any) => ({
            id: img.id,
            lat: img.lat,
            lon: img.lon,
            url:
              img.thumb_url ??
              `https://placehold.co/1200x700/0f172a/ffffff?text=No+Mapillary+Image+Found`,
          })),
          profile: [],
        });

        console.log("switching to advanced mode");
        setMode("advanced");

        // Force map re-fit after mode switch
        const currentAoi = aoi;
        setAOI(null);
        setTimeout(() => setAOI(currentAoi), 50);
      } else {
        alert(`Analysis failed: ${result.status}`);
      }
    } catch (e) {
      alert(`Error: ${e}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside
      className={`h-full ${
        mode === "simple"
          ? "rounded-xl border border-slate-200/70 bg-white/90 backdrop-blur shadow-lg text-slate-900"
          : "bg-[#0d1526] text-slate-100"
      } p-4 flex flex-col gap-4`}
    >
      <div>
        <h1 className="text-lg font-semibold leading-tight">GeoAI Risk Mapper</h1>
        <p
          className={`text-xs mt-1 ${
            mode === "simple" ? "text-slate-600" : "text-slate-400"
          }`}
        >
          Flood & Heat Risk Analysis
        </p>
      </div>

      {/* AOI summary */}
      <div
        className={`text-xs rounded-md p-2 ${
          mode === "simple"
            ? "bg-slate-100 text-slate-700"
            : "bg-slate-900 text-slate-300"
        }`}
      >
        <span className="font-semibold">AOI: </span>
        {aoiLabel}
        {drawnPath && drawnPath.length >= 2 && (
          <span
            className={`ml-1 ${
              mode === "simple" ? "text-cyan-600" : "text-cyan-400"
            }`}
          >
            ({drawnPath.length} pts)
          </span>
        )}
      </div>

      <div
        className={`text-xs rounded-md p-2 ${
          mode === "simple"
            ? "bg-slate-100 text-slate-700"
            : "bg-slate-900 text-slate-300"
        }`}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold">Line Width</span>
          <span>{pathWidthMeters} m</span>
        </div>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={pathWidthMeters}
          onChange={(e) => setPathWidthMeters(Number(e.target.value))}
          className="w-full accent-cyan-500"
        />
      </div>

      <button
        type="button"
        onClick={onRunAnalysis}
        disabled={isRunning || !aoi}
        className={`rounded-md px-3 py-2 text-sm font-semibold ${
          isRunning || !aoi
            ? "bg-slate-500 text-white cursor-not-allowed"
            : "bg-cyan-500 text-black hover:bg-cyan-400"
        }`}
      >
        {isRunning ? "Analyzing…" : !aoi ? "Draw a path first" : "Run Analysis"}
      </button>

      {hasResults && (
        <div
          className={`rounded-md p-3 ${
            mode === "simple" ? "bg-slate-100" : "bg-slate-900"
          } space-y-2`}
        >
          <p className="text-xs font-semibold">Risk Layer</p>
          <div className="flex gap-2">
            {(["flood", "heat"] as const).map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => setActiveLayer(layer)}
                className={`flex-1 rounded px-2 py-1 text-xs font-semibold capitalize ${
                  activeLayer === layer
                    ? layer === "flood"
                      ? "bg-blue-500 text-white"
                      : "bg-orange-500 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {layer}
              </button>
            ))}
          </div>
          <div className="text-xs space-y-1">
            {[
              { color: "#4caf50", label: "Low" },
              { color: "#ffeb3b", label: "Medium" },
              { color: "#ff9800", label: "High" },
              { color: "#f44336", label: "Extreme" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ background: color }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasResults && !isRunning && (
        <div
          className={`mt-auto text-xs ${
            mode === "simple" ? "text-slate-600" : "text-slate-400"
          }`}
        >
          Click <strong>Draw Path</strong> on the map, place points along the road,
          then hit <strong>Run Analysis</strong>.
        </div>
      )}
    </aside>
  );
}