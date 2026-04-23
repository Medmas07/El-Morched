"use client";
import { useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type L from "leaflet";
import Sidebar from "@/components/analysis/Sidebar";
import ImageViewer from "@/components/analysis/ImageViewer";
import ProfileChart from "@/components/analysis/ProfileChart";
import GeoAssistant from "@/components/assistant/GeoAssistant";
import SearchBar from "@/components/map/SearchBar";
import { useAnalysisStore } from "@/store/analysis";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const WaypointRouter = dynamic(() => import("@/components/map/WaypointRouter"), { ssr: false });

export default function Home() {
  const mode = useAnalysisStore((s) => s.mode);
  const setMode = useAnalysisStore((s) => s.setMode);

  const leafletMapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true);

  const handleMapReady = useCallback((map: L.Map) => {
    leafletMapRef.current = map;
    setMapReady(true);
  }, []);

  if (mode === "simple") {
    return (
      <main className="flex w-screen bg-slate-900" style={{ height: "100dvh" }}>
        <section className="relative flex-1 min-w-0">
          <MapView onMapReady={handleMapReady} />

          <div className="absolute left-4 top-4 z-[700] w-[280px]">
            <Sidebar />
          </div>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[700]">
            <SearchBar />
          </div>

          {mapReady && (
            <div className="absolute top-16 right-3 z-[560]">
              <WaypointRouter mapRef={leafletMapRef} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setMode("advanced")}
            className="absolute left-4 bottom-4 z-[700] rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-xs px-3 py-1.5 hover:bg-slate-700"
          >
            Advanced Mode
          </button>

          <button
            type="button"
            onClick={() => setAssistantOpen((prev) => !prev)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-[600] flex h-12 w-5 items-center justify-center rounded-l-lg bg-slate-800 border border-slate-700 border-r-0 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 transition-all"
            title={assistantOpen ? "Hide assistant" : "Show assistant"}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              {assistantOpen ? (
                <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              ) : (
                <path d="M7 1L3 5l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              )}
            </svg>
          </button>
        </section>

        {assistantOpen && (
          <div className="h-full w-[340px] min-w-[340px] flex-shrink-0 border-l border-slate-800 overflow-hidden bg-[#0a0e1a]">
            <GeoAssistant />
          </div>
        )}
      </main>
    );
  }

  const topRowHeight = "calc(100dvh - 240px)";
  const bottomRowHeight = "240px";

  return (
    <main
      className={`grid ${assistantOpen ? "grid-cols-[300px_1fr_1fr_340px]" : "grid-cols-[300px_1fr_1fr]"} bg-[#0b0f1a] text-slate-100`}
      style={{ height: "100dvh", gridTemplateRows: "calc(100dvh - 240px) 240px", overflow: "hidden" }}
    >
      <div className="row-span-2 border-r border-slate-800 overflow-hidden" style={{ maxHeight: "100dvh", overflowY: "auto" }}>
        <Sidebar />
      </div>
      <div
        className="border-b border-r border-slate-800 overflow-hidden"
        style={{ height: topRowHeight, minWidth: 0 }}
      >
        <ImageViewer />
      </div>
      <div
        className="border-b border-slate-800 relative overflow-hidden"
        style={{ height: topRowHeight, minWidth: 0 }}
      >
        <MapView onMapReady={handleMapReady} />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[700]">
          <SearchBar />
        </div>

        {mapReady && (
          <div className="absolute top-16 right-3 z-[560]">
            <WaypointRouter mapRef={leafletMapRef} />
          </div>
        )}

        <button
          type="button"
          onClick={() => setMode("simple")}
          className="absolute left-4 bottom-4 z-[700] rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-xs px-3 py-1.5 hover:bg-slate-700"
        >
          Simple Mode
        </button>

        <button
          type="button"
          onClick={() => setAssistantOpen((prev) => !prev)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-[600] flex h-12 w-5 items-center justify-center rounded-l-lg bg-slate-800 border border-slate-700 border-r-0 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 transition-all"
          title={assistantOpen ? "Hide assistant" : "Show assistant"}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            {assistantOpen ? (
              <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            ) : (
              <path d="M7 1L3 5l4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
            )}
          </svg>
        </button>
      </div>
      <div
        className="col-span-2 overflow-hidden"
        style={{ height: bottomRowHeight, minWidth: 0 }}
      >
        <ProfileChart />
      </div>
      {assistantOpen && (
        <div className="row-span-2 border-l border-slate-800 overflow-hidden" style={{ height: "calc(100dvh)", maxHeight: "100dvh" }}>
          <GeoAssistant />
        </div>
      )}
    </main>
  );
}