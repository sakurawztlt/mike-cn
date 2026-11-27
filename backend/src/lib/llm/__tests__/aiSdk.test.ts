import { describe, expect, it } from "vitest";
import { streamAiSdk, withPrefixCacheHints } from "../aiSdk";

const messages = [
  { role: "user" as const, content: "memory" },
  { role: "assistant" as const, content: "ok" },
  { role: "user" as const, content: "question" },
];

it("sends tool-read photos as native image input through the compatible adapter", async () => {
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const requests: { messages: { role: string; content: unknown }[] }[] = [];
  const tool = { id: "photo-call", index: 0, type: "function", function: { name: "read_document", arguments: '{"doc_id":"doc-0"}' } };
  const image = Buffer.from("ffd8ffe000104a4649460001", "hex");
  const model = createOpenAICompatible({
    name: "photo-fixture", baseURL: "https://photo-fixture.example/v1", apiKey: "fixture",
    fetch: async (_url, request) => {
      requests.push(JSON.parse(String(request?.body)));
      const first = requests.length === 1;
      const chunk = (delta: object, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: "fixture", model: "fixture", object: "chat.completion.chunk", created: 1,
          choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
      return new Response(
        chunk(first ? { role: "assistant", tool_calls: [tool] } : { role: "assistant", content: "I can see the photo." }, null) +
        chunk({}, first ? "tool_calls" : "stop") + "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  }).chatModel("fixture");
  const result = await streamAiSdk({
    model: "fixture",
    systemPrompt: "Read the attached source.",
    messages: [{ role: "user", content: "What is visible in the photo?" }],
    tools: [{ type: "function", function: { name: "read_document", description: "Read a document",
      parameters: { type: "object", properties: { doc_id: { type: "string" } }, required: ["doc_id"] } } }],
    runTools: async (calls) => {
      expect(calls[0]?.input).toEqual({ doc_id: "doc-0" });
      return [{ tool_use_id: "photo-call", content: "Original photo supplied.",
        images: [{ label: "doc-0", mediaType: "image/jpeg", bytes: image }] }];
    },
  }, { provider: "openai-compatible", label: "Test model", modelId: "fixture", model });
  expect(result.fullText).toBe("I can see the photo.");
  expect(requests).toHaveLength(2);
  expect(requests[1].messages.find((message) => message.role === "tool")?.content).toBe("Original photo supplied.");
  expect(requests[1].messages.at(-1)).toMatchObject({
    role: "user",
    content: expect.arrayContaining([{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } }]),
  });
});

describe("withPrefixCacheHints", () => {
  it("cache regression: places the extraction breakpoint before changing column instructions", () => {
    const prefix = "Document: Terms\nsource text";
    for (const instruction of ["Price", "Party"]) {
      const hints = withPrefixCacheHints({ model: "model", systemPrompt: "system",
        messages: [{ role: "user", content: prefix + instruction }], sourcePrefixLength: prefix.length },
        { sourceCachePoint: true });
      expect(hints.messages[0].content).toEqual([
        { type: "text", text: prefix, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
        { type: "text", text: instruction },
      ]);
    }
  });

  it("preserves the original source message for adapters without explicit source caching", () => {
    const source = [{ role: "user" as const, content: "Source\nInstructions" }];
    expect(withPrefixCacheHints({ model: "model", systemPrompt: "system", messages: source,
      sourcePrefixLength: 6 }).messages).toBe(source);
  });

  it("sends no cache hints for one-shot calls", () => {
    const hints = withPrefixCacheHints({
      model: "gpt-5",
      systemPrompt: "s",
      messages,
    });
    expect(hints.providerOptions).toBeUndefined();
    expect(hints.messages).toBe(messages);
  });

  it("keys the OpenAI cache by conversation and marks an Anthropic breakpoint on the last turn", () => {
    const hints = withPrefixCacheHints({
      model: "gpt-5",
      systemPrompt: "s",
      messages,
      conversationId: "chat-1",
    });
    expect(hints.providerOptions).toEqual({
      openai: { promptCacheKey: "chat-1" },
      azure: { promptCacheKey: "chat-1" },
    });
    // Only the final message carries the breakpoint: Anthropic caches
    // everything before it, and an earlier breakpoint would be wasted.
    expect(hints.messages.slice(0, -1).every((m) => !m.providerOptions)).toBe(
      true,
    );
    expect(hints.messages.at(-1)).toEqual({
      role: "user",
      content: "question",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
  });

  const withReasoning = [
    { role: "user" as const, content: "q1" },
    { role: "assistant" as const, content: "a1", reasoning: "why a1" },
    { role: "user" as const, content: "q2" },
  ];

  it("replays stored reasoning as a reasoning part when the model opts in", () => {
    const hints = withPrefixCacheHints(
      { model: "local-qwen", systemPrompt: "s", messages: withReasoning },
      { replayReasoning: true },
    );
    expect(hints.messages).toEqual([
      { role: "user", content: "q1" },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "why a1" },
          { type: "text", text: "a1" },
        ],
      },
      { role: "user", content: "q2" },
    ]);
  });

  it("drops stored reasoning for every other model", () => {
    const hints = withPrefixCacheHints({
      model: "gpt-5",
      systemPrompt: "s",
      messages: withReasoning,
      conversationId: "chat-1",
    });
    expect(hints.messages[1]).toEqual({ role: "assistant", content: "a1" });
    expect(JSON.stringify(hints.messages)).not.toContain("why a1");
  });

  it("keeps the cache breakpoint on a final assistant turn with replayed reasoning", () => {
    const hints = withPrefixCacheHints(
      {
        model: "local-qwen",
        systemPrompt: "s",
        messages: withReasoning.slice(0, 2),
        conversationId: "chat-1",
      },
      { replayReasoning: true },
    );
    expect(hints.messages[0].providerOptions).toBeUndefined();
    expect(hints.messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "reasoning", text: "why a1" },
        { type: "text", text: "a1" },
      ],
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    });
  });

  it("adds a Bedrock cache point only when the adapter asks for one", () => {
    const params = {
      model: "bedrock/us.anthropic.claude-opus-5-5",
      systemPrompt: "s",
      messages,
      conversationId: "chat-1",
    };
    expect(
      withPrefixCacheHints(params, { bedrockCachePoint: true }).messages.at(-1)
        ?.providerOptions,
    ).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
      bedrock: { cachePoint: { type: "default" } },
    });
    expect(
      withPrefixCacheHints(params).messages.at(-1)?.providerOptions,
    ).not.toHaveProperty("bedrock");
  });
});
