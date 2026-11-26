import {
  CHINA_LEGAL_ID_PREFIX,
  chinaCaseCitation,
  chinaLawCitation,
  chinaLegalCoverage,
  findChinaLawArticle,
  formatChinaLawArticle,
  getChinaLegalLibrary,
  loadChinaCase,
  loadChinaLaw,
} from "../../lib/chinaLegalLibrary";
import type { ExternalSource, SourceDocument } from "../../lib/sourceDocuments";
import { readWebPage } from "../../lib/webSearch/pageReader";
import type { SourceProvider } from "./sourceDocuments.types";

function buildSource(
  documentId: string,
  title: string,
  type: "case" | "legislation",
  url: string,
  metadata: SourceDocument["metadata"],
  body: string,
): ExternalSource {
  return {
    text: body,
    document: {
      document_id: documentId, title, type, metadata, quotes: [],
      actions: [{ type: "link", url }],
      subdocuments: [{ document_id: `${documentId}:text`, title, type: "html" }],
    },
  };
}

type ChinaLegalRead =
  | { ok: true; source: ExternalSource; reference: Record<string, unknown>; selectedText: string }
  | { ok: false; error: string; reference?: Record<string, unknown> };

export async function readChinaLegalDocument(
  documentId: string,
  options: { article?: string; signal?: AbortSignal } = {},
): Promise<ChinaLegalRead> {
  const id = /^cn-legal:(law|case):([\w:-]{1,160})$/.exec(documentId);
  if (!id) return { ok: false, error: "请使用中国法检索返回的来源编号。" };
  const db = getChinaLegalLibrary();
  if (!db) return { ok: false, error: "当前实例尚未安装中国法资料库。" };

  if (id[1] === "law") {
    const item = loadChinaLaw(db, id[2]);
    if (!item) return { ok: false, error: "这个法规版本在本地库中没有可读取的正文。" };
    const { law, articles } = item;
    const coverage = chinaLegalCoverage(db);
    const reference = { ...chinaLawCitation(law), ...coverage };
    const article = options.article ? findChinaLawArticle(db, law.id, options.article) : undefined;
    if (options.article && !article) return { ok: false, error: "该版本中未找到指定条文。", reference };
    const text = articles.map(formatChinaLawArticle).join("\n\n");
    const metadata = [
      { label: "版本状态", value: reference.snapshot_status },
      ...(law.document_number ? [{ label: "文号", value: law.document_number }] : []),
      ...(law.issuing_body ? [{ label: "制定机关", value: law.issuing_body }] : []),
      ...(law.effective_at ? [{ label: "施行日期", value: law.effective_at }] : []),
      ...(law.repealed_at ? [{ label: "废止日期", value: law.repealed_at }] : []),
      ...(coverage.law_snapshot ? [{ label: "法规快照", value: coverage.law_snapshot }] : []),
    ];
    const title = law.effective_at ? `${law.title}（${law.effective_at}版）` : law.title;
    return {
      ok: true, reference: { ...reference, ...(article && { article: article.number_display }) },
      selectedText: article ? formatChinaLawArticle(article) : text,
      source: buildSource(documentId, title, "legislation", law.source_url, metadata, text),
    };
  }

  const item = loadChinaCase(db, id[2]);
  if (!item) return { ok: false, error: "当前目录中找不到这个最高法发布条目。" };
  const reference = chinaCaseCitation(item);
  try {
    const page = await readWebPage(item.url, { signal: options.signal });
    const finalUrl = new URL(page.url);
    if (finalUrl.origin !== "https://www.court.gov.cn" ||
        !finalUrl.pathname.endsWith(`/xiangqing/${item.id}.html`) || !page.text.trim()) {
      return { ok: false, error: "官方发布页无法按原编号核验，请打开原链接。", reference };
    }
    return {
      ok: true, reference, selectedText: page.text,
      source: buildSource(documentId, item.title, "case", item.url, [
        { label: "出处", value: "最高人民法院 · 指导性案例发布栏目" },
        ...(item.date ? [{ label: "发布日期", value: item.date }] : []),
      ], page.text),
    };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, error: "暂时无法读取官方发布页，请使用原链接核验。", reference };
  }
}

export const chinaLegalSourceProvider: SourceProvider = {
  id: "china_legal",
  ownsDocumentId: (id) => id.startsWith(CHINA_LEGAL_ID_PREFIX),
  quoteVerification: "exact",
  async fetch({ documentId }) {
    const result = await readChinaLegalDocument(documentId);
    if (!result.ok) return { ok: false, kind: "not_found", detail: result.error };
    const { document, text } = result.source;
    return {
      ok: true,
      document: {
        ...document,
        subdocuments: document.subdocuments?.map((part) => ({ ...part, text })),
      },
    };
  },
};
