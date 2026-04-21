import dynamic from "next/dynamic";
import ControlPanel from "@/components/analysis/ControlPanel";

// Leaflet must be loaded client-side only (no SSR)
const RiskMap = dynamic(() => import("@/components/map/RiskMap"), { ssr: false });

export default function Home() {
  return (
    <main className="flex h-screen w-screen overflow-hidden">
      <ControlPanel />
      <div className="flex-1 relative">
        <RiskMap />
      </div>
    </main>
  );
}
