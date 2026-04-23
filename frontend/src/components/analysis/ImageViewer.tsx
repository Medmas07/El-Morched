"use client";

import { useEffect } from "react";
import { useAnalysisStore } from "@/store/analysis";

function clampIndex(index: number, len: number) {
  if (len <= 0) return 0;
  if (index < 0) return 0;
  if (index >= len) return len - 1;
  return index;
}

export default function ImageViewer() {
  const images = useAnalysisStore((s) => s.images);
  const currentIndex = useAnalysisStore((s) => s.currentIndex);
  const isPlaying = useAnalysisStore((s) => s.isPlaying);
  const setIndex = useAnalysisStore((s) => s.setIndex);
  const next = useAnalysisStore((s) => s.next);
  const prev = useAnalysisStore((s) => s.prev);
  const play = useAnalysisStore((s) => s.play);
  const pause = useAnalysisStore((s) => s.pause);

  const active = images[clampIndex(currentIndex, images.length)];
  const imageSrc = active?.url?.trim() || active?.thumb_url?.trim() || "";
  console.log("active:", active, "imageSrc:", imageSrc);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      next();
    }, 900);
    return () => window.clearInterval(timer);
  }, [isPlaying, next]);

  useEffect(() => {
    console.log("=== ImageViewer DEBUG ===");
    console.log("images.length:", images.length);
    console.log("currentIndex:", currentIndex);
    console.log("active:", active);
    console.log("imageSrc:", imageSrc);

    const img = document.querySelector("img[alt]") as HTMLImageElement | null;
    if (img) {
      const rect = img.getBoundingClientRect();
      console.log("img element found:", img.src.slice(0, 60));
      console.log("img dimensions:", {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      });
      console.log("img naturalSize:", {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
      console.log("img display:", window.getComputedStyle(img).display);
      console.log("img visibility:", window.getComputedStyle(img).visibility);
      console.log("img opacity:", window.getComputedStyle(img).opacity);

      let el: HTMLElement | null = img;
      let depth = 0;
      while (el && depth < 8) {
        const style = window.getComputedStyle(el);
        const rect2 = el.getBoundingClientRect();
        console.log(
          `parent[${depth}] tag=${el.tagName} class="${el.className}" w=${rect2.width} h=${rect2.height} overflow=${style.overflow} display=${style.display}`
        );
        el = el.parentElement;
        depth++;
      }
    } else {
      console.log("NO img element found in DOM");
    }
  }, [images, imageSrc, active, currentIndex]);

  return (
    <section className="w-full bg-[#0f172a] text-slate-100 p-3 flex flex-col gap-2" style={{ height: "100%" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-cyan-300">Image Viewer</h2>
        <span className="text-xs text-slate-400">
          {images.length ? `${currentIndex + 1} / ${images.length}` : "No images"}
        </span>
      </div>

      <div className="rounded-lg border border-slate-700 bg-black overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>
        {images.length === 0 || !imageSrc ? (
          <div className="flex h-full items-center justify-center text-slate-500 text-sm text-center px-4">
            No street images found for this area.
            <br />
            Mapillary coverage may be limited here.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={active.id} className="w-full object-cover" style={{ height: "100%", display: "block" }} />
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={prev}
          className="rounded bg-slate-800 px-2 py-2 text-sm hover:bg-slate-700"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={next}
          className="rounded bg-slate-800 px-2 py-2 text-sm hover:bg-slate-700"
        >
          Next
        </button>
        <button
          type="button"
          onClick={isPlaying ? pause : play}
          className="rounded bg-cyan-500 px-2 py-2 text-sm text-black font-medium hover:bg-cyan-400"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => setIndex(0)}
          className="rounded bg-slate-800 px-2 py-2 text-sm hover:bg-slate-700"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
