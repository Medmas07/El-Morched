import { create } from "zustand";
import type { BBox, AnalysisResult, RiskLayer, MapillaryImage } from "@/types";

type ActiveLayer = "flood" | "heat" | "images";

interface AnalysisStore {
  bbox: BBox | null;
  setBbox: (bbox: BBox | null) => void;

  runId: string | null;
  status: string;
  result: AnalysisResult | null;
  setResult: (r: AnalysisResult) => void;
  setRunId: (id: string, status: string) => void;

  activeLayer: ActiveLayer;
  setActiveLayer: (l: ActiveLayer) => void;

  images: MapillaryImage[];
  setImages: (imgs: MapillaryImage[]) => void;

  selectedImageId: string | null;
  setSelectedImage: (id: string | null) => void;
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  bbox: null,
  setBbox: (bbox) => set({ bbox }),

  runId: null,
  status: "idle",
  result: null,
  setResult: (result) => set({ result, status: result.status }),
  setRunId: (runId, status) => set({ runId, status }),

  activeLayer: "flood",
  setActiveLayer: (activeLayer) => set({ activeLayer }),

  images: [],
  setImages: (images) => set({ images }),

  selectedImageId: null,
  setSelectedImage: (selectedImageId) => set({ selectedImageId }),
}));
