const BACKEND_URL = "http://localhost:8000/api/v1";

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
];

const SYSTEM_PROMPT = `You are GeoAI, a geospatial assistant.
Use tools only when explicitly required by the rules below.

RULE 1 — run_risk_analysis: Only call if user explicitly names a place.
Never invent locations. If no place named, ask for one.

RULE 2 — set_waypoints: Only call if user gives at least TWO place names.
Never invent destinations. If only one place, ask for destination.

RULE 3 — Knowledge questions (why/how/what causes/explain):
Answer directly. Do NOT call any tool.

RULE 4 — get_risk_summary: Call when user asks about current map results.

RULE 5 — geocode_location: Call when user asks to navigate to a place.

RULE 6 — get_weather: Call when user asks about weather for a place.`;

const TEST_CASES = [
  {
    name: "Navigate to place",
    userMessage: "Show me Sousse, Tunisia on the map",
    expectTool: "geocode_location",
    expectArg: "location",
  },
  {
    name: "Build a route",
    userMessage: "Route me from Tunis to Sfax",
    expectTool: "set_waypoints",
    expectArg: "waypoints",
  },
  {
    name: "Get weather",
    userMessage: "What is the weather in Bizerte right now?",
    expectTool: "get_weather",
    expectArg: "location",
  },
  {
    name: "Ambiguous analysis — should ask clarification",
    userMessage: "Run an analysis",
    expectTool: null,
    expectClarification: true,
  },
  {
    name: "Named analysis",
    userMessage: "Run a flood risk analysis around Nabeul with 2km radius",
    expectTool: "run_risk_analysis",
    expectArg: "location",
  },
  {
    name: "Explain risk — no data loaded",
    userMessage: "Summarize the current risk results",
    expectTool: "get_risk_summary",
    expectArg: null,
  },
  {
    name: "Risk summary with no data",
    userMessage: "Summarize the risk results",
    expectTool: "get_risk_summary",
    expectArg: null,
  },
  {
    name: "Route with only one place — should ask clarification",
    userMessage: "Route me from Tunis",
    expectTool: null,
    expectClarification: true,
  },
  {
    name: "Analysis without location — should ask clarification",
    userMessage: "Run risk analysis please",
    expectTool: null,
    expectClarification: true,
  },
  {
    name: "Full pipeline — analyze then explain",
    userMessage: "Run a risk analysis around Tunis center with 1km radius, then explain the results",
    expectTool: "run_risk_analysis",
    expectArg: "location",
  },
  {
    name: "Geo knowledge question",
    userMessage: "What causes flash floods in coastal Tunisia?",
    expectTool: null,
    expectClarification: false,
  },
  {
    name: "Clear overlays",
    userMessage: "Clear the map route",
    expectTool: "clear_map_overlays",
    expectArg: null,
  },
];

async function chat(messages, tools, signal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${BACKEND_URL}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          tools,
          tool_choice: "auto",
          temperature: 0.2,
          max_tokens: 1200,
        }),
        signal,
      });

      if (response.status === 502) {
        const body = await response.text();
        if (body.includes("rate_limit_exceeded")) {
          const match = body.match(/try again in (\d+(?:\.\d+)?)s/);
          const waitMs = match ? Math.ceil(parseFloat(match[1])) * 1000 + 500 : 8000;
          console.log(`  ⏳ Rate limited, waiting ${(waitMs / 1000).toFixed(1)}s...`);
          await sleep(waitMs);
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${body}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

function firstNonEmptyArgValue(parsedArgs, argName) {
  const value = parsedArgs?.[argName];
  if (value == null) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  if (Array.isArray(value)) return value.length > 0 ? value : null;
  return value;
}

function formatCalledTool(toolCall) {
  const fnName = toolCall?.function?.name ?? "unknown";
  let args = {};
  try {
    args = JSON.parse(toolCall?.function?.arguments ?? "{}");
  } catch {
    args = {};
  }

  const entries = Object.entries(args);
  if (!entries.length) return fnName;

  const [key, value] = entries[0];
  if (typeof value === "string") {
    return `${fnName}(${key}=${JSON.stringify(value)})`;
  }
  return `${fnName}(${key}=${JSON.stringify(value)})`;
}

const verbose = process.argv.includes("--verbose");
const fast = process.argv.includes("--fast");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const interTestDelayMs = fast ? 500 : 3000;

try {
  const healthCheckController = new AbortController();
  const timeoutId = setTimeout(() => healthCheckController.abort(), 8000);
  try {
    await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "ping" },
      ],
      TOOLS,
      healthCheckController.signal
    );
  } finally {
    clearTimeout(timeoutId);
  }
} catch (error) {
  console.error(
    `Backend connection failed at ${BACKEND_URL}. Ensure FastAPI is running.\n${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
}

const failures = [];
const breakdown = [];
let passed = 0;

for (let index = 0; index < TEST_CASES.length; index += 1) {
  const testCase = TEST_CASES[index];
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: testCase.userMessage },
  ];

  let response;
  try {
    response = await chat(messages, TOOLS);
  } catch (error) {
    const detail = `request failed: ${error instanceof Error ? error.message : String(error)}`;
    failures.push({ name: testCase.name, detail });
    console.log(`❌ FAIL  [${testCase.name}] — ${detail}`);
    continue;
  }

  const assistantMessage = response?.choices?.[0]?.message ?? {};
  const toolCalls = assistantMessage.tool_calls ?? [];
  const textContent = assistantMessage.content ?? "";
  const firstTool = toolCalls[0];
  const calledTool = firstTool?.function?.name ?? null;
  let parsedArgs = null;
  try {
    const raw = firstTool?.function?.arguments;
    parsedArgs = raw ? JSON.parse(raw) : null;
  } catch {
    parsedArgs = null;
  }

  let isPass = false;
  let failDetail = "";
  let passDetail = "";

  if (testCase.expectTool !== null) {
    if (!toolCalls.length) {
      failDetail = `expected tool call: ${testCase.expectTool}, got no tool call`;
    } else if (calledTool !== testCase.expectTool) {
      failDetail = `expected tool call: ${testCase.expectTool}, got tool call: ${calledTool}`;
    } else if (testCase.expectArg) {
      const argValue = firstNonEmptyArgValue(parsedArgs, testCase.expectArg);
      if (argValue == null) {
        failDetail = `expected non-empty argument '${testCase.expectArg}' for ${calledTool}`;
      } else if (typeof argValue === "string") {
        passDetail = `called ${calledTool}(${testCase.expectArg}=${JSON.stringify(argValue)})`;
        isPass = true;
      } else {
        passDetail = `called ${calledTool}(${testCase.expectArg}=${JSON.stringify(argValue)})`;
        isPass = true;
      }
    } else {
      passDetail = `called ${calledTool}`;
      isPass = true;
    }
  } else if (testCase.expectClarification === true) {
    if (toolCalls.length === 0 && textContent.includes("?")) {
      passDetail = "asked a clarification question with no tool call";
      isPass = true;
    } else if (toolCalls.length > 0) {
      failDetail = `expected clarification question, got tool call: ${calledTool}`;
    } else {
      failDetail = "expected clarification question containing '?' with no tool call";
    }
  } else {
    if (toolCalls.length === 0 && textContent.length > 20) {
      passDetail = `no tool called, answered with ${textContent.length} chars`;
      isPass = true;
    } else if (toolCalls.length > 0) {
      failDetail = `expected no tool call, got tool call: ${calledTool}`;
    } else {
      failDetail = "expected direct answer text longer than 20 chars";
    }
  }

  if (isPass) {
    passed += 1;
    const detail = testCase.expectTool ? passDetail : `no tool called, answer: ${JSON.stringify(textContent.slice(0, 120))}`;
    console.log(`✅ PASS  [${testCase.name}] — ${detail}`);
    if (!testCase.expectTool) {
      console.log(`ℹ️  INFO  [${testCase.name}] — no tool called, answer: ${JSON.stringify(textContent.slice(0, 180))}`);
    }
  } else {
    failures.push({ name: testCase.name, detail: failDetail });
    console.log(`❌ FAIL  [${testCase.name}] — ${failDetail}`);
  }

  if (verbose) {
    console.log(`↳ Assistant: ${textContent ? JSON.stringify(textContent) : '""'}`);
  }

  let extractedArgKey = null;
  let extractedArgValue = null;
  if (calledTool && firstTool?.function?.arguments) {
    const entries = parsedArgs ? Object.entries(parsedArgs) : [];
    if (entries.length > 0) {
      extractedArgKey = entries[0][0];
      extractedArgValue = entries[0][1];
    }
  }

  breakdown.push({
    name: testCase.name,
    passed: isPass,
    calledTool,
    extractedArgKey,
    extractedArgValue,
    preview: textContent.slice(0, 90),
  });

  if (index < TEST_CASES.length - 1) {
    await sleep(interTestDelayMs);
  }
}

console.log(`=== RESULTS: ${passed}/${TEST_CASES.length} passed ===`);

console.log("Breakdown:");
for (const item of breakdown) {
  const status = item.passed ? "PASS" : "FAIL";
  const toolPart = item.calledTool ? `tool=${item.calledTool}` : "tool=none";
  const argPart = item.extractedArgKey
    ? `${item.extractedArgKey}=${JSON.stringify(item.extractedArgValue)}`
    : "arg=n/a";
  console.log(`- [${status}] ${item.name} :: ${toolPart} :: ${argPart} :: text=${JSON.stringify(item.preview)}`);
}

if (failures.length) {
  console.log("Failures:");
  for (const failure of failures) {
    console.log(`- [${failure.name}] ${failure.detail}`);
  }
  process.exitCode = 1;
}