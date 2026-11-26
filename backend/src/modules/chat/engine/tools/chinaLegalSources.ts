import { chinaLegalIdForUrl, getChinaLegalLibrary, searchChinaLegalLibrary } from "../../../../lib/chinaLegalLibrary";
import { readChinaLegalDocument } from "../../../source-documents/sourceDocuments.service";

export const CHINA_LEGAL_SEARCH = {
  type: "function",
  function: {
    name: "search_cn_legal_sources",
    description: "Search the local Mainland China statute corpus and the Supreme People's Court's official guiding-case catalogue. For exact statutes, pass law and optionally article and as_of; returns source IDs for available versions. For guiding cases, use short title keywords or the guidance number. Search hits are research leads; read the selected source before citing it.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Short keywords separated by spaces, or a law name. Use de-identified terms." },
        kind: { type: "string", enum: ["law", "case", "all"] },
        law: { type: "string", description: "Statute name or alias, e.g. 公司法. Lists versions available in the corpus." },
        article: { type: "string", description: "Article number, e.g. 47, 第四十七条, or 17-1." },
        as_of: { type: "string", description: "Relevant date for a named statute, in YYYY-MM-DD form." },
      },
      additionalProperties: false,
    },
  },
} as const;

export const CHINA_LEGAL_READ = {
  type: "function",
  function: {
    name: "read_cn_legal_source",
    description: "Read statute text from the specific version or open an official SPC publication returned by search_cn_legal_sources. Use its source_id and optionally article for a statute. The result gives an official link and can be cited in the source panel.",
    parameters: {
      type: "object",
      properties: {
        source_id: { type: "string" },
        article: { type: "string" },
        url: { type: "string", description: "An exact previously returned official source URL, if source_id is unavailable." },
      },
      additionalProperties: false,
    },
  },
} as const;

function inputText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function searchChinaLegalSources(args: Record<string, unknown>) {
  const query = inputText(args.query);
  const law = inputText(args.law);
  const article = inputText(args.article);
  const asOf = inputText(args.as_of);
  const kind = args.kind ?? (law ? "law" : "all");
  if ((!query && !law) || query.length > 300 || law.length > 200 || article.length > 40 ||
      (kind !== "law" && kind !== "case" && kind !== "all")) {
    return { error: "请输入简短的检索词或法规名。" };
  }
  if (kind === "case" && !query) return { error: "请输入案例标题关键词或指导性案例编号。" };
  if ((article || asOf) && !law) return { error: "按条号或时点检索时，请同时提供法规名称。" };
  if (asOf) {
    const date = new Date(asOf);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== asOf) {
      return { error: "请填写有效的 YYYY-MM-DD 日期。" };
    }
  }
  const db = getChinaLegalLibrary();
  if (!db) return { error: "当前实例尚未安装中国法资料库。" };
  return searchChinaLegalLibrary(db, { query, kind, law: law || undefined, article: article || undefined, asOf: asOf || undefined });
}

export async function readChinaLegalSource(args: Record<string, unknown>, signal?: AbortSignal) {
  const db = getChinaLegalLibrary();
  let id = inputText(args.source_id);
  const url = inputText(args.url);
  const article = inputText(args.article);
  if (!id && db && url.length <= 2048) id = chinaLegalIdForUrl(db, url) ?? "";
  if (!id || article.length > 40) {
    return { ok: false as const, error: "请使用该资料库返回的来源编号或原文链接。" };
  }
  return readChinaLegalDocument(id, { article: article || undefined, signal });
}
