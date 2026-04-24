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

// ── Icons ────────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="8" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="8" y="8" width="5" height="5" rx="1" />
    </svg>
  );
}

function IconMap() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="12" height="12" rx="2" />
      <circle cx="7" cy="7" r="2.5" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="10" height="7" rx="2" />
      <circle cx="5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <path d="M7 1v3" strokeLinecap="round" />
      <circle cx="7" cy="1" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Toolbar pill shared between modes ────────────────────────────────────────

function ToolbarBtn({
  active,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${
        active
          ? "border-cyan-400/35 bg-cyan-400/12 text-cyan-300"
          : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-cyan-400/25 hover:bg-cyan-400/[0.08] hover:text-cyan-300"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────

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

  // ── Simple mode ─────────────────────────────────────────────────────────────
  if (mode === "simple") {
    return (
      <main
        className="relative w-screen overflow-hidden"
        style={{ height: "100dvh", background: "#070d1a" }}
      >
        {/* Full-screen map */}
        <div className="absolute inset-0 z-0">
          <MapView onMapReady={handleMapReady} />
        </div>

        {/* Floating sidebar – glassmorphism left panel */}
        <div className="absolute left-4 top-4 z-[700] w-[300px] animate-slide-in-left">
          <Sidebar />
        </div>

        {/* Centered search bar */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[700]">
          <SearchBar />
        </div>

        {/* Waypoint router — shifts left when assistant is open */}
        {mapReady && (
          <div
            className="absolute top-[72px] z-[560] transition-all duration-300"
            style={{ right: assistantOpen ? 356 : 12 }}
          >
            <WaypointRouter mapRef={leafletMapRef} />
          </div>
        )}

        {/* Floating bottom toolbar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[700] flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <ToolbarBtn onClick={() => setMode("advanced")} label="Advanced">
            <IconGrid />
          </ToolbarBtn>
          <div className="mx-0.5 h-4 w-px bg-white/10" />
          <ToolbarBtn
            active={assistantOpen}
            onClick={() => setAssistantOpen((p) => !p)}
            label="AI Assistant"
          >
            <IconBot />
          </ToolbarBtn>
        </div>

        {/* Assistant slide-in panel */}
        {assistantOpen && (
          <div className="absolute right-0 top-0 z-[800] h-full w-[340px] animate-slide-in-right shadow-[-12px_0_48px_rgba(0,0,0,0.45)]">
            <GeoAssistant />
          </div>
        )}
      </main>
    );
  }

  // ── Advanced mode ────────────────────────────────────────────────────────────
  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: assistantOpen ? "300px 1fr 340px" : "300px 1fr",
        gridTemplateRows: "1fr 200px",
        height: "100dvh",
        gap: "4px",
        padding: "4px",
        background: "#070d1a",
        overflow: "hidden",
      }}
    >
      {/* ── Left: Sidebar (full height) ─────────────────────────────────────── */}
      <div className="row-span-2 overflow-hidden rounded-xl">
        <Sidebar />
      </div>

      {/* ── Center-top: ImageViewer + Map ──────────────────────────────────── */}
      <div className="flex min-h-0 gap-1 overflow-hidden rounded-xl">
        {/* ImageViewer — 40% */}
        <div className="w-[40%] flex-shrink-0 overflow-hidden rounded-xl">
          <ImageViewer />
        </div>

        {/* Map — 60%, with floating overlays */}
        <div className="relative flex-1 min-w-0 overflow-hidden rounded-xl">
          <MapView onMapReady={handleMapReady} />

          {/* Search */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[700]">
            <SearchBar />
          </div>

          {/* Waypoint router */}
          {mapReady && (
            <div className="absolute top-[60px] right-3 z-[560]">
              <WaypointRouter mapRef={leafletMapRef} />
            </div>
          )}

          {/* Bottom mode/assistant toolbar */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[700] flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 py-1 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            <ToolbarBtn onClick={() => setMode("simple")} label="Simple">
              <IconMap />
            </ToolbarBtn>
            <div className="mx-0.5 h-4 w-px bg-white/10" />
            <ToolbarBtn
              active={assistantOpen}
              onClick={() => setAssistantOpen((p) => !p)}
              label="AI Assistant"
            >
              <IconBot />
            </ToolbarBtn>
          </div>
        </div>
      </div>

      {/* ── Center-bottom: Elevation profile ──────────────────────────────── */}
      <div className="min-h-0 overflow-hidden rounded-xl">
        <ProfileChart />
      </div>

      {/* ── Right: AI Assistant (full height) ─────────────────────────────── */}
      {assistantOpen && (
        <div className="row-span-2 overflow-hidden rounded-xl">
          <GeoAssistant />
        </div>
      )}
    </main>
  );
}
