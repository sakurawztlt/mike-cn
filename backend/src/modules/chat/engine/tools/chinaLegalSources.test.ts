import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DocIndex, DocStore } from "../types";
import type { Db } from "../../../../lib/supabase";

const fixture = vi.hoisted(() => ({ db: undefined as DatabaseSync | undefined, readPage: vi.fn() }));
vi.mock("../../../../lib/chinaLegalLibrary", async (original) => ({
  ...(await original<typeof import("../../../../lib/chinaLegalLibrary")>()),
  getChinaLegalLibrary: () => fixture.db,
}));
vi.mock("../../../../lib/webSearch/pageReader", async (original) => ({
  ...(await original<typeof import("../../../../lib/webSearch/pageReader")>()),
  readWebPage: fixture.readPage,
}));

import { readChinaLegalSource, searchChinaLegalSources } from "./chinaLegalSources";
import { runToolCalls } from "./toolDispatcher";
import { getSourceDocument } from "../../../source-documents/sourceDocuments.service";

const oldId = "cn-legal:law:company-old";
const currentId = "cn-legal:law:company-current";
const caseId = "cn-legal:case:331181";
const caseUrl = "https://www.court.gov.cn/fabu/xiangqing/331181.html";
const caseText = "范例裁判理由，仅用于测试原文引用。";

beforeAll(() => {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(resolve(__dirname, "../../../../../scripts/china-legal-schema.sql"), "utf8"));
  db.exec(`
    INSERT INTO library_info VALUES ('law_snapshot', '2026-09-30');
    INSERT INTO laws VALUES
      ('company-old', 'company', '中华人民共和国公司法', 'law', '全国人大常委会', NULL, '2018-10-26', '2018-10-26', NULL, 'amended', 'https://flk.npc.gov.cn/detail?id=old', NULL, NULL),
      ('company-current', 'company', '中华人民共和国公司法', 'law', '全国人大常委会', NULL, '2023-12-29', '2024-07-01', NULL, 'current', 'https://flk.npc.gov.cn/detail?id=current', NULL, NULL),
      ('missing-date', 'some-law', '某法规', 'law', NULL, NULL, NULL, NULL, NULL, 'unknown', 'https://flk.npc.gov.cn/detail?id=unknown', NULL, NULL);
    INSERT INTO law_names VALUES ('公司法', 'company-old'), ('公司法', 'company-current'), ('某法规', 'missing-date');
    INSERT INTO articles VALUES
      ('company-old', '47', '第四十七条', '历史版本测试正文。', 1),
      ('company-current', '47', '第四十七条', '现行版本测试正文含注册资本。', 1),
      ('company-current', '48', '第四十八条', '这是下一条。', 2);
    INSERT INTO article_search(article_search) VALUES ('rebuild');
    INSERT INTO cases VALUES ('331181', '指导案例167号：买卖合同纠纷案', '2021-11-11', '${caseUrl}');
  `);
  fixture.db = db;
});

beforeEach(() => {
  fixture.readPage.mockReset();
  fixture.readPage.mockResolvedValue({ url: caseUrl, text: caseText });
});

afterAll(() => fixture.db?.close());

describe("China legal sources", () => {
  it("shows historical candidates, their successor date and the requested article", () => {
    const result = searchChinaLegalSources({ law: "《公司法》", article: "第47条", as_of: "2020-01-02" });
    expect(result).toMatchObject({ hits: [
      expect.objectContaining({ source_id: oldId, next_version_effective_at: "2024-07-01",
        article_found: true, as_of_status: "当日版本候选，仍须核对过渡规定" }),
      expect.objectContaining({ source_id: currentId, as_of_status: "当日尚未施行" }),
    ] });
    expect(searchChinaLegalSources({ law: "某法规", as_of: "2024-01-01" })).toMatchObject({ hits: [{
      as_of_status: "当日效力待核验",
    }] });
    expect(searchChinaLegalSources({ law: "公司法", as_of: "2024-02-30" })).toHaveProperty("error");
  });

  it("finds text outside law titles, including a short Chinese word", () => {
    for (const query of ["注册资本", "资本"]) {
      expect(searchChinaLegalSources({ kind: "law", query })).toEqual(expect.objectContaining({ hits: [expect.objectContaining({
        source_id: currentId, article: "第四十七条", text_excerpt: expect.stringContaining("注册资本"),
      })] }));
    }
  });

  it("reads the named law version and resolves the same origin link from the source panel", async () => {
    const result = await readChinaLegalSource({ source_id: oldId, article: "第四十七条" });
    expect(result).toMatchObject({ ok: true, selectedText: "第四十七条　历史版本测试正文。" });
    const panel = await getSourceDocument({} as Db, { userId: "u", documentId: oldId });
    expect(panel).toMatchObject({ ok: true, document: {
      provider: "china_legal", quote_verification: "exact", type: "legislation",
      actions: [{ type: "link", url: "https://flk.npc.gov.cn/detail?id=old" }],
      subdocuments: [expect.objectContaining({ text: "第四十七条　历史版本测试正文。" })],
    } });
    expect((await readChinaLegalSource({ source_id: oldId, article: "48" })).ok).toBe(false);
  });

  it("registers an official case as a citable source through the normal chat tool dispatcher", async () => {
    expect(searchChinaLegalSources({ kind: "case", query: "指导性案例167号" })).toMatchObject({ hits: [
      expect.objectContaining({ source_id: caseId, url: caseUrl }),
    ] });
    const docStore: DocStore = new Map();
    const docIndex: DocIndex = {};
    const result = await runToolCalls([{
      id: "read", function: { name: "read_cn_legal_source", arguments: JSON.stringify({ source_id: caseId }) },
    }], docStore, "u", {} as Db, vi.fn(), undefined, undefined, docIndex);
    const handle = result.externalSourceHandles?.get("read");
    expect(handle).toBeTruthy();
    expect(docStore.get(handle!)).toMatchObject({ inline_text: caseText, external_source: {
      type: "case", actions: [{ type: "link", url: caseUrl }],
    } });
    expect(result.toolResults[0]).toMatchObject({ content: expect.stringContaining(caseUrl) });
    expect(fixture.readPage).toHaveBeenCalledWith(caseUrl, expect.anything());
  });

  it("keeps the official link when a case page cannot be read and rejects unindexed URLs", async () => {
    fixture.readPage.mockRejectedValue(new Error("Unavailable"));
    expect(await readChinaLegalSource({ url: caseUrl })).toMatchObject({ ok: false, reference: { url: caseUrl } });
    fixture.readPage.mockClear();
    expect((await readChinaLegalSource({ url: "https://www.court.gov.cn/other" })).ok).toBe(false);
    expect(fixture.readPage).not.toHaveBeenCalled();
  });
});
