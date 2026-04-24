"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AssistantChatMessage } from "@/lib/api";
import { useAnalysisStore, type DrawnPathPoint } from "@/store/analysis";

const GROQ_MODEL = "llama-3.1-8b-instant";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type Role = "user" | "assistant" | "tool";

interface Message {
  id: string;
  role: Role;
  content: string;
  toolCallId?: string;
  toolName?: string;
  isStreaming?: boolean;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
  boundingbox?: [string, string, string, string];
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "geocode_location",
      description: "Convert a place name or address into coordinates and center the map there.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "A place name or address such as 'Tunis, Tunisia'",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_waypoints",
      description:
        "Place two or more named waypoints on the map, compute an OSRM driving route, and update the path overlay.",
      parameters: {
        type: "object",
        properties: {
          waypoints: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            description: "Ordered list of place names to route through",
          },
        },
        required: ["waypoints"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Fetch current and recent weather for a location.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Place name, e.g. 'Sfax, Tunisia'" },
          days_back: {
            type: "number",
            description: "How many days of history to include",
            default: 7,
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_risk_summary",
      description: "Read the risk analysis results currently loaded in the app and summarize them.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_risk_analysis",
      description:
        "Run a new flood and heat risk analysis for a named location and center the map on the resulting area.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "Location name, e.g. 'Nabeul, Tunisia'",
          },
          radius_km: {
            type: "number",
            description: "Radius around the location in kilometers",
            default: 2,
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_map_overlays",
      description: "Remove assistant-generated waypoints, route overlays, and drawn path state.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
] as const;

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function geocode(location: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=jsonv2&limit=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) return null;
  const data = (await res.json()) as GeocodeResult[];
  if (!data.length) return null;
  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    display_name: data[0].display_name,
    boundingbox: data[0].boundingbox,
  };
}

async function getOSRMRoute(coords: { lat: number; lon: number }[]) {
  const coordStr = coords.map((c) => `${c.lon},${c.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("OSRM routing failed");
  const data = await res.json();
  if (data.code !== "Ok") throw new Error("OSRM returned a non-Ok response");
  return data.routes[0] as {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
  };
}

function buildSystemPrompt() {
  const state = useAnalysisStore.getState();
  const hasRisk = state.floodLayers.length > 0 || state.heatLayers.length > 0;

  return `You are GeoAI, a geospatial assistant for flood/heat risk mapping.

TOOL RULES (never violate):
- run_risk_analysis: ONLY if user names a specific place. Never invent locations.
- set_waypoints: ONLY if user gives 2+ place names. Never invent destinations.
- Knowledge questions (why/how/what causes): answer directly, no tools.
- get_risk_summary: when user asks about current map results.
- geocode_location: when user asks to navigate/find a place.
- get_weather: when user asks about weather for a place.

APP STATE:
- Risk loaded: ${hasRisk ? `YES (${state.floodLayers.length} flood, ${state.heatLayers.length} heat zones)` : "NO"}
- AOI: ${state.aoi ? "set" : "none"} | Layer: ${state.activeLayer} | Running: ${state.isRunning ? "YES" : "no"}

Scores: 0-0.2=none, 0.2-0.4=low, 0.4-0.6=medium, 0.6-0.8=high, 0.8-1.0=extreme.
Be concise. Use bullet points. Max 100 words per response.`;
}

function getContextualSuggestions(): string[] {
  return ["Analyze this area", "What's the weather here?"];
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  actions: {
    flyTo: (target: { lat: number; lon: number; zoom: number }) => void;
    setAOI: (aoi: { west: number; south: number; east: number; north: number } | null) => void;
    setRunning: (running: boolean) => void;
    setRiskResults: (flood: unknown[], heat: unknown[]) => void;
    setAssistantWaypoints: (waypoints: { lat: number; lon: number; label: string }[]) => void;
    setAssistantRoute: (route: DrawnPathPoint[]) => void;
    clearAssistantRoute: () => void;
    setMode: (mode: "simple" | "advanced") => void;
    setData: (payload: {
      trajectory: { lat: number; lon: number; elevation: number; image_id: string }[];
      images: { id: string; url: string; lat: number; lon: number }[];
      profile: { distance: number; elevation: number; slope: number }[];
    }) => void;
    setLastAnalysisDurationSeconds: (seconds: number | null) => void;
    setDrawnPath: (path: DrawnPathPoint[] | null) => void;
  }
): Promise<string> {
  switch (name) {
    case "geocode_location": {
      const location = String(args.location ?? "");
      const geo = await geocode(location);
      if (!geo) return `Could not find "${location}".`;

      const [south, north, west, east] = geo.boundingbox ?? [null, null, null, null];
      if (south && north && west && east) {
        actions.setAOI({
          south: Number(south),
          north: Number(north),
          west: Number(west),
          east: Number(east),
        });
      }

      actions.flyTo({ lat: geo.lat, lon: geo.lon, zoom: 13 });
      return JSON.stringify({
        action: "map_centered",
        location: geo.display_name,
        lat: geo.lat,
        lon: geo.lon,
      });
    }

    case "set_waypoints": {
      const places = Array.isArray(args.waypoints) ? args.waypoints.map(String) : [];
      if (places.length < 2) return "At least two places are required.";

      const resolved: { lat: number; lon: number; label: string }[] = [];
      for (const place of places) {
        const geo = await geocode(place);
        if (!geo) return `Could not geocode waypoint: ${place}`;
        resolved.push({ lat: geo.lat, lon: geo.lon, label: place });
      }

      const route = await getOSRMRoute(resolved);
      const routePath: DrawnPathPoint[] = route.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));

      let minLat = routePath[0]?.lat ?? resolved[0].lat;
      let maxLat = minLat;
      let minLon = routePath[0]?.lon ?? resolved[0].lon;
      let maxLon = minLon;

      for (const point of [...routePath, ...resolved]) {
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLon = Math.min(minLon, point.lon);
        maxLon = Math.max(maxLon, point.lon);
      }

      actions.setAssistantWaypoints(resolved);
      actions.setAssistantRoute(routePath);
      actions.setDrawnPath(routePath);
      actions.setAOI({ west: minLon, south: minLat, east: maxLon, north: maxLat });
      actions.flyTo({ lat: resolved[Math.floor(resolved.length / 2)].lat, lon: resolved[Math.floor(resolved.length / 2)].lon, zoom: 11 });

      return JSON.stringify({
        action: "route_plotted",
        waypoints: resolved,
        route_distance_km: Number((route.distance / 1000).toFixed(1)),
        route_duration_min: Math.round(route.duration / 60),
      });
    }

    case "get_weather": {
      const location = String(args.location ?? "");
      const daysBack = clamp(Number(args.days_back ?? 7), 1, 90);
      const geo = await geocode(location);
      if (!geo) return `Could not find "${location}".`;

      const weather = await api.weather.get(geo.lat, geo.lon, daysBack);
      return JSON.stringify({ location: geo.display_name, lat: geo.lat, lon: geo.lon, weather });
    }

    case "get_risk_summary": {
      const state = useAnalysisStore.getState();
      if (!state.floodLayers.length && !state.heatLayers.length) {
        return JSON.stringify({
          error: "No risk analysis results loaded. Use run_risk_analysis first."
        });
      }

      const summarizeLayers = (layers: typeof state.floodLayers) => {
        if (!layers.length) return null;
        const scores = layers.map(l => l.score);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const max = Math.max(...scores);
        const dist = { none: 0, low: 0, medium: 0, high: 0, extreme: 0 };
        for (const l of layers) {
          const cat = Number((l.components as Record<string, unknown>).category ?? 1);
          if (cat === 0) dist.none++;
          else if (cat === 1) dist.low++;
          else if (cat === 2) dist.medium++;
          else if (cat === 3) dist.high++;
          else dist.extreme++;
        }

        const highRiskLayer = layers.find(l => l.score > 0.6) ?? layers[0];
        const c = highRiskLayer.components as Record<string, unknown>;

        return {
          total_zones: layers.length,
          avg_score: Number(avg.toFixed(3)),
          max_score: Number(max.toFixed(3)),
          distribution: dist,
          dominant_factors: {
            weather_score: c.weather_score ?? c.heat_stress_score ?? null,
            terrain_score: c.mean_terrain_score ?? null,
            impervious_surface_pct: c.vision_impervious ?? c.uhi_proxy ?? null,
            vegetation_coverage: c.vegetation_coverage ?? null,
            simulation_engine: c.engine ?? null,
            mean_temp_c: c.mean_temp_c ?? null,
            rainfall_contribution: c.weather_score ?? null,
          }
        };
      };

      return JSON.stringify({
        aoi: state.aoi,
        active_layer: state.activeLayer,
        analysis_duration_seconds: state.lastAnalysisDurationSeconds,
        flood: summarizeLayers(state.floodLayers),
        heat: summarizeLayers(state.heatLayers),
        interpretation_guide: {
          score_ranges: "0-0.2=none, 0.2-0.4=low, 0.4-0.6=medium, 0.6-0.8=high, 0.8-1.0=extreme",
          weather_score: "0-1, derived from 7-day rainfall totals and peak intensity",
          terrain_score: "0-1, higher means flatter/lower elevation = more flood prone",
          impervious_surface: "0-1, fraction of concrete/asphalt from street imagery",
          vegetation: "0-1, higher means more trees/grass = better cooling and drainage"
        }
      });
    }

    case "run_risk_analysis": {
      const location = String(args.location ?? "");
      const radiusKm = clamp(Number(args.radius_km ?? 2), 0.5, 25);
      const geo = await geocode(location);
      if (!geo) return `Could not find "${location}".`;

      const delta = radiusKm / 111;
      const bbox = {
        west: geo.lon - delta,
        south: geo.lat - delta,
        east: geo.lon + delta,
        north: geo.lat + delta,
      };

      actions.setAOI(bbox);
      actions.flyTo({ lat: geo.lat, lon: geo.lon, zoom: 13 });
      actions.setRunning(true);

      try {
        const run = await api.analysis.run({
          bbox,
          simulation_engine: "null",
        });
        const result = await api.analysis.poll(run.run_id, 2000, 120_000);

        const validImages = (result.images ?? []).filter(
          (img: { url?: string }) => img.url && img.url.trim() !== ""
        );

        if (validImages.length > 0) {
          actions.setData({
            trajectory: validImages.map((img, i) => ({
              lat: img.lat,
              lon: img.lon,
              elevation: 0,
              image_id: img.id ?? `img-${i}`,
            })),
            images: validImages.map((img) => ({
              id: img.id,
              url: img.url,
              lat: img.lat,
              lon: img.lon,
            })),
            profile: [],
          });
        }

        actions.setRiskResults(result.flood_layers ?? [], result.heat_layers ?? []);
        actions.setLastAnalysisDurationSeconds(null);
        actions.setAOI(bbox);
        actions.flyTo({
          lat: (bbox.north + bbox.south) / 2,
          lon: (bbox.east + bbox.west) / 2,
          zoom: 13,
        });

        return JSON.stringify({
          action: "analysis_completed",
          location: geo.display_name,
          bbox,
          status: result.status,
          flood_layers: result.flood_layers?.length ?? 0,
          heat_layers: result.heat_layers?.length ?? 0,
          images_fetched: validImages.length,
          note: validImages.length
            ? "Switched to advanced mode. Street images and risk polygons now visible."
            : "Risk polygons rendered. No street images found for this area (Mapillary coverage may be limited)."
        });
      } catch (error) {
        return `Analysis failed: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        actions.setRunning(false);
      }
    }

    case "clear_map_overlays": {
      actions.clearAssistantRoute();
      actions.setDrawnPath(null);
      return JSON.stringify({ action: "assistant_overlays_cleared" });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

function formatToolResult(name: string, result: string) {
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>;
    switch (name) {
      case "geocode_location":
        return `📍 Centered on ${String(parsed.location ?? "location")}`;
      case "set_waypoints":
        return `🛣️ Route placed · ${String(parsed.route_distance_km ?? "?")} km · ~${String(parsed.route_duration_min ?? "?")} min`;
      case "get_weather":
        return `🌦️ Weather loaded for ${String(parsed.location ?? "location")}`;
      case "get_risk_summary":
        return parsed.error ? `⚠️ ${String(parsed.error)}` : "📊 Risk summary ready";
      case "run_risk_analysis":
        return `✅ Analysis complete for ${String(parsed.location ?? "location")}`;
      case "clear_map_overlays":
        return "🧹 Assistant overlays cleared";
      default:
        return "✓ Tool completed";
    }
  } catch {
    return result.length > 140 ? `${result.slice(0, 140)}…` : result;
  }
}

function formatMarkdown(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="rounded bg-slate-900 px-1 py-0.5 font-mono text-[11px] text-cyan-300">$1</code>')
    .replace(/^- /gm, "• ");
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <span key={`${index}-${line}`}>
          <span dangerouslySetInnerHTML={{ __html: formatMarkdown(line) }} />
          {index < lines.length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

function AssistantTyping() {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
        ✦
      </div>
      <div className="flex items-center gap-1.5 rounded-[22px] border border-white/[0.08] bg-white/[0.04] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-dot-bounce"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function GeoAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm GeoAI. Ask me to navigate, route, check weather, or run a risk analysis.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flyTo = useAnalysisStore((s) => s.flyTo);
  const setAOI = useAnalysisStore((s) => s.setAOI);
  const setRunning = useAnalysisStore((s) => s.setRunning);
  const setMode = useAnalysisStore((s) => s.setMode);
  const setData = useAnalysisStore((s) => s.setData);
  const setRiskResults = useAnalysisStore((s) => s.setRiskResults);
  const setLastAnalysisDurationSeconds = useAnalysisStore((s) => s.setLastAnalysisDurationSeconds);
  const setAssistantWaypoints = useAnalysisStore((s) => s.setAssistantWaypoints);
  const setAssistantRoute = useAnalysisStore((s) => s.setAssistantRoute);
  const clearAssistantRoute = useAnalysisStore((s) => s.clearAssistantRoute);
  const setDrawnPath = useAnalysisStore((s) => s.setDrawnPath);
  const activeLayer = useAnalysisStore((s) => s.activeLayer);
  const lastAnalysisDurationSeconds = useAnalysisStore((s) => s.lastAnalysisDurationSeconds);
  const isRunning = useAnalysisStore((s) => s.isRunning);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "0px";
    const nextHeight = Math.min(inputRef.current.scrollHeight, 180);
    inputRef.current.style.height = `${nextHeight}px`;
  }, [input]);

  const actions = {
    flyTo,
    setAOI,
    setRunning,
    setMode,
    setData,
    setRiskResults,
    setLastAnalysisDurationSeconds,
    setAssistantWaypoints,
    setAssistantRoute,
    clearAssistantRoute,
    setDrawnPath,
  };

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setInput("");

      const userMessage: Message = {
        id: genId(),
        role: "user",
        content: trimmed,
      };

      setMessages((prev) => [...prev, userMessage]);

      const recentMessages = messages
        .filter((message) => message.role !== "tool")
        .slice(-4)
        .map((message) => ({ role: message.role, content: message.content }));

      const conversation: AssistantChatMessage[] = [
        { role: "system", content: buildSystemPrompt() },
        ...recentMessages,
        { role: "user", content: trimmed },
      ];

      try {
        for (let iteration = 0; iteration < 6; iteration += 1) {
          const requestBody = {
            model: GROQ_MODEL,
            messages: conversation,
            tools: TOOLS as unknown as unknown[],
            tool_choice: "auto",
            temperature: 0.2,
            max_tokens: 1200,
          };

          let content = "";
          let toolCalls: ToolCall[] = [];

          {
            const response = await api.assistant.chat(requestBody, {
              signal: controller.signal,
            });
            const assistantMessage = response.choices?.[0]?.message;

            content = assistantMessage?.content ?? "";
            toolCalls = (assistantMessage?.tool_calls as ToolCall[] | undefined) ?? [];

            if (content) {
              setMessages((prev) => [...prev, { id: genId(), role: "assistant", content }]);
            }
          }

          conversation.push({
            role: "assistant",
            content,
            tool_calls: toolCalls,
          });

          if (!toolCalls.length) break;

          for (const toolCall of toolCalls as ToolCall[]) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(toolCall.function.arguments || "{}");
            } catch {
              args = {};
            }

            const toolMessageId = genId();
            const summary =
              toolCall.function.name === "set_waypoints" && Array.isArray(args.waypoints)
                ? `Routing ${String((args.waypoints as string[]).join(" → "))}`
                : toolCall.function.name === "geocode_location" && args.location
                  ? `Finding ${String(args.location)}`
                  : toolCall.function.name === "run_risk_analysis" && args.location
                    ? `Analyzing ${String(args.location)}`
                    : `Running ${toolCall.function.name}`;

            setMessages((prev) => [
              ...prev,
              {
                id: toolMessageId,
                role: "tool",
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                content: summary,
              },
            ]);

            const result = await executeTool(toolCall.function.name, args, actions);
            const shortResult = formatToolResult(toolCall.function.name, result);

            setMessages((prev) =>
              prev.map((message) =>
                message.id === toolMessageId ? { ...message, content: shortResult } : message
              )
            );

            conversation.push({
              role: "tool",
              content: result,
              tool_call_id: toolCall.id,
            });
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMessages((prev) => [
            ...prev,
            {
              id: genId(),
              role: "assistant",
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ]);
        }
      } finally {
        setLoading(false);
      }
    },
    [actions, loading, messages]
  );

  const sendCurrent = useCallback(() => void sendText(input), [input, sendText]);

  const stopGeneration = useCallback(() => {
    if (!loading) return;
    abortRef.current?.abort();
    setLoading(false);
    setMessages((prev) => [
      ...prev,
      {
        id: genId(),
        role: "assistant",
        content: "Stopped. You can send another request.",
      },
    ]);
  }, [loading]);

  const clearChat = useCallback(() => {
    setMessages([
      {
        id: genId(),
        role: "assistant",
        content: "Chat cleared. How can I help you?",
      },
    ]);
  }, []);

  const contextualSuggestions = getContextualSuggestions();

  return (
    <section className="flex h-full w-full flex-col overflow-hidden bg-[#08101f] border-0">
      <header className="border-b border-white/5 bg-gradient-to-r from-cyan-500/12 via-blue-500/10 to-fuchsia-500/12 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.16)]">
                ✦
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-50">GeoAI Assistant</h2>
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Groq · map-aware · risk-aware</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearChat}
              title="Clear chat"
              className="rounded-xl border border-white/8 bg-white/[0.03] p-1.5 text-slate-500 transition hover:border-white/15 hover:text-slate-300"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {contextualSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void sendText(suggestion)}
              className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400 text-left transition hover:border-cyan-400/20 hover:bg-cyan-400/[0.06] hover:text-slate-200 truncate"
              title={suggestion}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </header>

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3" style={{ minHeight: 0 }}>
        <div className="space-y-4">
          {messages.map((message) => {
            const isUser = message.role === "user";
            const isTool = message.role === "tool";

            if (isUser) {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[86%] rounded-[22px] rounded-tr-md border border-cyan-400/20 bg-cyan-500/12 px-4 py-3 text-sm leading-relaxed text-slate-50 shadow-[0_10px_30px_rgba(34,211,238,0.08)]">
                    <MarkdownText text={message.content} />
                  </div>
                </div>
              );
            }

            if (isTool) {
              return (
                <div key={message.id} className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[11px] text-cyan-200">
                    ⌁
                  </div>
                  <div className="flex-1 rounded-[20px] border border-white/8 bg-white/[0.035] px-3 py-2.5 text-[12px] text-slate-300">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">Tool</div>
                    <MarkdownText text={message.content} />
                  </div>
                </div>
              );
            }

            return (
              <div key={message.id} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
                  ✦
                </div>
                <div className="flex-1 rounded-[22px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-100">
                  <MarkdownText text={message.content} />
                </div>
              </div>
            );
          })}

          {loading ? <AssistantTyping /> : null}
        </div>
      </div>

      <footer className="border-t border-white/5 px-3 py-3 bg-[#08101f]">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendCurrent();
              }
            }}
            placeholder="Ask anything..."
            className="min-h-[44px] flex-1 min-w-0 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/30 focus:bg-white/[0.06] transition-all"
            rows={1}
          />
          {loading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-all flex-shrink-0"
              title="Stop"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1"/>
              </svg>
            </button>
          ) : (
            <button
              type="button"
              disabled={!input.trim()}
              onClick={sendCurrent}
              className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 hover:border-cyan-300/40 hover:bg-cyan-400/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m22 2-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}