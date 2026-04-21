"use client";
import { useAnalysisStore } from "@/store/analysis";
import { useAnalysis } from "@/hooks/useAnalysis";

export default function ControlPanel() {
  const { bbox, status, result, activeLayer, setActiveLayer } = useAnalysisStore();
  const { runAnalysis } = useAnalysis();

  return (
    <div className="flex flex-col gap-4 p-4 bg-white border-r border-gray-200 w-72 h-full overflow-y-auto">
      <h1 className="text-lg font-bold text-gray-900">GeoAI Risk Engine</h1>

      {/* AOI info */}
      <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
        {bbox
          ? `${bbox.south.toFixed(4)}°N, ${bbox.west.toFixed(4)}°E → ${bbox.north.toFixed(4)}°N, ${bbox.east.toFixed(4)}°E`
          : "Hold Shift + drag on the map to select an area"}
      </div>

      {/* Run button */}
      <button
        onClick={runAnalysis}
        disabled={!bbox || status === "running" || status === "pending"}
        className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition"
      >
        {status === "running" || status === "pending" ? "Analyzing…" : "Run Analysis"}
      </button>

      {/* Layer switcher */}
      {result && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Layers</p>
          {(["flood", "heat", "images"] as const).map((layer) => (
            <button
              key={layer}
              onClick={() => setActiveLayer(layer)}
              className={`text-left px-3 py-2 rounded text-sm capitalize ${
                activeLayer === layer
                  ? "bg-blue-100 text-blue-800 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {layer === "flood" ? "🌊 Flood Risk" : layer === "heat" ? "🌡 Heat Vulnerability" : "📷 Street Images"}
            </button>
          ))}
        </div>
      )}

      {/* Result summary */}
      {result && result.status === "completed" && (
        <div className="text-xs text-gray-600 bg-green-50 rounded p-2 space-y-1">
          <p>Engine: <strong>{result.simulation_engine_used}</strong></p>
          <p>Images analyzed: <strong>{result.image_count}</strong></p>
          <p>Flood zones: <strong>{result.flood_layers.length}</strong></p>
          <p>Heat zones: <strong>{result.heat_layers.length}</strong></p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-auto">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Risk Legend</p>
        {[
          ["Low", "#4caf50"],
          ["Medium", "#ffeb3b"],
          ["High", "#ff9800"],
          ["Extreme", "#f44336"],
        ].map(([label, color]) => (
          <div key={label} className="flex items-center gap-2 text-xs mb-1">
            <span className="w-4 h-4 rounded" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
