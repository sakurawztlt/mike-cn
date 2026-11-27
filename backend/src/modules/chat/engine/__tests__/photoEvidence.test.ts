import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocStore } from "../types";
import type { Db } from "../../../../lib/supabase";

const storage = vi.hoisted(() => ({ openFileStream: vi.fn() }));
vi.mock("../../../../lib/storage", async (original) => ({
  ...(await original<typeof import("../../../../lib/storage")>()),
  openFileStream: storage.openFileStream,
}));

import { runToolCalls } from "../tools/toolDispatcher";
import type { TurnReadState } from "../tools/documentOps";

const photoBytes = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const photoStore: DocStore = new Map([
  ["doc-0", { filename: "Evidence.png", file_type: "png", storage_path: "private/source.png" }],
  ["doc-1", { filename: "Agreement.docx", file_type: "docx", storage_path: "", inline_text: "Payment is due on delivery." }],
]);
const read = { id: "read", function: { name: "read_document", arguments: '{"doc_id":"doc-0"}' } };
const fetch = { id: "fetch", function: { name: "fetch_documents", arguments: '{"doc_ids":["doc-0","doc-1"]}' } };

function run(call: typeof read, docs: DocStore = photoStore, state?: TurnReadState, bytes = 0) {
  const write = vi.fn();
  return runToolCalls([call], docs, "fixture-user", {} as Db, write,
    undefined, undefined, undefined, undefined, state, undefined, undefined, undefined, "nonce",
    { photoBudget: { count: 0, bytes } },
  ).then((result) => ({ result, write }));
}

describe("chat photo reads", () => {
  beforeEach(() => {
    storage.openFileStream.mockReset().mockImplementation(async () => Readable.from([photoBytes]));
  });

  it("opens only the authorized source and records a successful read without image bytes in events", async () => {
    const state: TurnReadState = new Map();
    const { result, write } = await run(read, photoStore, state);
    expect(storage.openFileStream).toHaveBeenCalledWith("private/source.png", { signal: undefined });
    expect(result.toolImages?.get("read")).toEqual([{ label: "doc-0", mediaType: "image/png", bytes: photoBytes }]);
    expect(result.docsRead).toEqual([expect.objectContaining({ filename: "Evidence.png" })]);
    expect(JSON.stringify(write.mock.calls)).toContain("doc_read");
    expect(JSON.stringify(write.mock.calls)).not.toContain(photoBytes.toString("base64"));
    expect(JSON.stringify(result.toolResults)).not.toContain("private/source.png");
    expect((await run(read, photoStore, state)).result.toolImages).toBeUndefined();
    expect(storage.openFileStream).toHaveBeenCalledOnce();
  });

  it("reads mixed text and photos in a batch while keeping photo bytes separate", async () => {
    const { result } = await run(fetch);
    expect(result.toolImages?.get("fetch")?.[0].bytes).toEqual(photoBytes);
    expect(JSON.stringify(result.toolResults)).toContain("Payment is due on delivery.");
    expect(result.docsRead.map(({ filename }) => filename)).toEqual(["Evidence.png", "Agreement.docx"]);
  });

  it("does not fetch storage for an absent document and does not mark failed photos as read", async () => {
    const unavailable = await run(read, new Map());
    expect(unavailable.result.toolImages).toBeUndefined();
    expect(storage.openFileStream).not.toHaveBeenCalled();
    const state: TurnReadState = new Map();
    const limited = await run(read, photoStore, state, 16 * 1024 * 1024 - 1);
    expect(limited.result.docsRead).toEqual([]);
    expect(limited.result.toolImages).toBeUndefined();
    expect(JSON.stringify(limited.result.toolResults)).toContain("remaining visual-reading limit");
    expect(state.size).toBe(0);
  });
});
