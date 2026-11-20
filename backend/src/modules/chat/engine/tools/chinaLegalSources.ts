import { readWebPage } from "../../../../lib/webSearch/pageReader";

const SOURCE_WARNING =
  "这是有限的官方公开资料索引。命中只提供检索线索和原文入口。请核对裁判全文、法条版本与案件时点后再引用。";

type OfficialSource = {
  kind: "guiding_case" | "typical_cases" | "statute" | "judicial_interpretation";
  title: string;
  url: string;
  date: string;
  terms: readonly string[];
};

const SOURCES: readonly OfficialSource[] = [
  {
    kind: "guiding_case", title: "指导案例180号 · 孙贤锋劳动合同纠纷案",
    url: "https://www.court.gov.cn/shenpan/xiangqing/364641.html",
    date: "2022-07-04", terms: ["指导案例180", "解除", "辞退", "解除通知", "违纪", "孙贤锋"],
  },
  {
    kind: "typical_cases", title: "劳动人事争议典型案例（第二批）",
    url: "https://www.court.gov.cn/zixun/xiangqing/319151.html",
    date: "2021-08-26", terms: ["加班", "工时", "休息", "加班费", "举证", "延长工作"],
  },
  {
    kind: "typical_cases", title: "最高人民法院发布劳动争议典型案例",
    url: "https://www.court.gov.cn/zixun/xiangqing/431252.html",
    date: "2024-04-30", terms: ["竞业", "服务期", "违约金", "劳动争议", "劳动合同"],
  },
  {
    kind: "typical_cases", title: "最高法发布劳动争议典型案例（司法解释二发布会）",
    url: "https://www.court.gov.cn/zixun/xiangqing/472681.html",
    date: "2025-08-01", terms: ["社保", "社会保险", "未缴纳", "解除", "经济补偿", "竞业", "劳动合同"],
  },
  {
    kind: "typical_cases", title: "最高法、人社部、全总发布涉欠薪纠纷典型案例",
    url: "https://www.court.gov.cn/shenpan/xiangqing/423922.html",
    date: "2024-01-25", terms: ["欠薪", "工资", "试用", "劳动报酬", "解除"],
  },
  {
    kind: "guiding_case", title: "最高人民法院新就业形态劳动争议专题指导性案例发布目录",
    url: "https://www.court.gov.cn/zixun/xiangqing/450651.html",
    date: "2024-12-23", terms: ["骑手", "配送", "劳动关系", "平台", "新就业形态", "用工"],
  },
  {
    kind: "statute", title: "中华人民共和国劳动合同法 · 国家法律法规数据库",
    url: "https://flk.npc.gov.cn/detail?bbbs=2c909fdd678bf17901678bf74d7106b3",
    date: "2012-12-28", terms: ["劳动合同法", "劳动合同", "解除", "竞业", "试用", "经济补偿", "赔偿金", "欠薪"],
  },
  {
    kind: "judicial_interpretation", title: "最高人民法院关于审理劳动争议案件适用法律问题的解释（一）",
    url: "https://www.court.gov.cn/zixun/xiangqing/282121.html",
    date: "2020-12-29", terms: ["劳动争议", "仲裁", "时效", "工资", "解除", "劳动关系", "经济补偿", "竞业"],
  },
  {
    kind: "judicial_interpretation", title: "最高人民法院关于审理劳动争议案件适用法律问题的解释（二）",
    url: "https://www.court.gov.cn/fabu/xiangqing/472691.html",
    date: "2025-07-31", terms: ["劳动争议", "解除", "社会保险", "社保", "竞业", "二倍工资", "劳动关系"],
  },
];

export const CHINA_LEGAL_SEARCH = {
  type: "function",
  function: {
    name: "search_cn_legal_sources",
    description: "Find official PRC labor-law source links and case leads in the local starter index. Use short de-identified Chinese issue keywords. Results require review of the official original.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
};

export function searchChinaLegalSources(query: unknown) {
  if (typeof query !== "string" || !query.trim() || query.length > 300) {
    return { error: "请提供 1–300 字的去标识化争点关键词。", coverage: SOURCE_WARNING };
  }

  const normalized = query.normalize("NFKC");
  const hits = SOURCES.flatMap(({ terms, ...source }) => {
    const matched = terms.filter((term) => normalized.includes(term));
    return matched.length ? [{ ...source, matched }] : [];
  }).sort((a, b) => b.matched.length - a.matched.length);

  return { coverage: SOURCE_WARNING, hits };
}


export const CHINA_LEGAL_READ = {
  type: "function",
  function: {
    name: "read_cn_legal_source",
    description: "Read the published official Supreme People's Court text from an exact URL returned by search_cn_legal_sources. Accessing a publication is not judicial status verification.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
};

export async function readChinaLegalSource(url: unknown, signal?: AbortSignal) {
  const source = SOURCES.find((entry) => entry.url === url);
  if (!source) return { error: "只能读取本索引返回的官方来源链接。" };
  if (!source.url.startsWith("https://www.court.gov.cn/")) {
    return { url: source.url, error: "法规库详情由浏览器加载。请在官方链接核对条文和时点。" };
  }
  try {
    const page = await readWebPage(source.url, { signal });
    if (new URL(page.url).hostname !== "www.court.gov.cn") {
      return { url: source.url, error: "来源发生跨站跳转，请人工核对原文。" };
    }
    return {
      url: source.url,
      title: source.title,
      publicationType: source.kind,
      truncated: page.text.length > 24000,
      text: page.text.slice(0, 24000),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { url: source.url, error: "暂时无法取得官方正文，请使用链接人工核验。" };
  }
}
