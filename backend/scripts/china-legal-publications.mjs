import { parseHTML } from "linkedom";

const courtOrigin = "https://www.court.gov.cn";
export const casesUrl = courtOrigin + "/fabu/gengduo/151.html";
const courtPage = /^\/(?:fabu|zixun|shenpan)\/xiangqing\/(\d+)\.html$/;
const listPage = /^\/fabu\/gengduo\/151(?:_\d+)?\.html$/;
const mojOrigin = "https://xzfg.moj.gov.cn";
const isoDate = /\d{4}-\d{2}-\d{2}/;

async function readOfficialPage(url) {
  const response = await fetch(url, {
    redirect: "error",
    headers: { "user-agent": "Mike-CN public legal catalogue" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Official publication request failed (HTTP " + response.status + ")");
  return parseHTML(await response.text()).document;
}

export async function fetchCaseCatalogue() {
  const cases = new Map();
  const visited = new Set();
  let page = casesUrl;
  while (page) {
    const url = new URL(page);
    if (url.origin !== courtOrigin || !listPage.test(url.pathname) || visited.has(page) || visited.size >= 40) {
      throw new Error("Unexpected pagination in the court's guiding-case catalogue");
    }
    visited.add(page);
    const document = await readOfficialPage(url);
    const entries = document.querySelectorAll(".sec_list > ul:first-of-type > li");
    if (!entries.length) throw new Error("The court catalogue no longer has the expected case list");
    for (const entry of entries) {
      const link = entry.querySelector("a[href]");
      if (!link) continue;
      const target = new URL(link.getAttribute("href"), url);
      const match = courtPage.exec(target.pathname);
      const title = (link.getAttribute("title") || link.textContent).trim();
      if (target.origin !== courtOrigin || !match || !title) continue;
      cases.set(match[1], { id: match[1], title, date: entry.querySelector(".date")?.textContent.trim() ?? null,
        url: target.origin + target.pathname });
    }
    const next = document.querySelector(".yiiPager .next:not(.hidden) a[href]")?.getAttribute("href");
    page = next ? new URL(next, url).href : null;
  }
  if (cases.size < 100 || visited.size < 2) throw new Error("The court catalogue result is incomplete");
  return [...cases.values()];
}

function regulationEntry(row) {
  const link = row.querySelector(".title a[href]");
  const url = new URL(link?.getAttribute("href") || "", mojOrigin);
  const key = url.searchParams.get("LawID") ?? "";
  const published = row.querySelector(".publish-date")?.textContent.match(isoDate)?.[0];
  const effective = row.querySelector(".implemented-date")?.textContent.match(isoDate)?.[0] ?? null;
  const title = link?.textContent.trim();
  if (url.origin !== mojOrigin || url.pathname !== "/front/law/detail" || !/^\d+$/.test(key) ||
      !published || !title) {
    throw new Error("The official administrative regulations list changed format");
  }
  url.search = new URLSearchParams({ LawID: key }).toString();
  return { key, url: url.href, title, published, effective };
}

export async function fetchRecentRegulations(since) {
  const results = new Map();
  let previousPublished = null;
  // This route is the public site's publication-date sort. Stop on the
  // previous watermark, including its day in case of a late publication.
  for (let index = 1; index <= 20; index++) {
    const url = new URL("/SearchLaw", mojOrigin);
    url.search = new URLSearchParams({ SortData: "PublishTime", SortType: "desc", PageIndex: String(index) }).toString();
    const document = await readOfficialPage(url);
    const list = [...document.querySelectorAll(".search-in-title")];
    if (!list.length) throw new Error("The official administrative regulations list is unavailable");
    for (const row of list) {
      const item = regulationEntry(row);
      if (previousPublished && item.published > previousPublished) {
        throw new Error("The official administrative regulations list is not sorted by publication date");
      }
      if (item.published < since) return [...results.values()];
      previousPublished = item.published;
      results.set(item.key, item);
    }
    if (list.length < 10) return [...results.values()];
  }
  throw new Error("The administrative regulations update exceeded its pagination limit");
}

function numeral(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = "零一二三四五六七八九";
  const units = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let digit = null;
  for (const char of value) {
    if (units[char]) {
      total += (digit ?? 1) * units[char];
      digit = null;
    } else {
      digit = char === "两" ? 2 : char === "〇" ? 0 : digits.indexOf(char);
      if (digit < 0) throw new Error("Unexpected Chinese article number");
    }
  }
  return total + (digit ?? 0);
}

const articleStart = /^(第([零〇一二三四五六七八九十百千两\d]+)条(?:之([零〇一二三四五六七八九十百千两\d]+))?)/u;

export function regulationArticles(document, entry) {
  const container = document.querySelector(".law-chapter");
  const publishedTitle = document.querySelector(".text-title")?.textContent.trim();
  if (!container || publishedTitle !== entry.title) throw new Error("Official regulation title or body did not match");
  const articles = [];
  let current = { number: "preamble", label: "", paragraphs: [] };
  for (const item of container.querySelectorAll("p")) {
    const text = item.textContent.replace(/\u00a0/g, " ").trim();
    if (!text) continue;
    const match = articleStart.exec(text);
    if (match) {
      if (current.paragraphs.length) articles.push(current);
      current = {
        number: String(numeral(match[2])) + (match[3] ? "-" + numeral(match[3]) : ""),
        label: match[1],
        paragraphs: [],
      };
    }
    current.paragraphs.push(text);
  }
  if (current.paragraphs.length) articles.push(current);
  if (!articles.some((article) => article.number === "1") || articles.length < 3) {
    throw new Error("The complete article text could not be verified on the official regulation page");
  }
  return articles.map(({ paragraphs, ...item }) => ({ ...item, text: paragraphs.join("\n") }));
}

export async function fetchRegulation(entry) {
  return regulationArticles(await readOfficialPage(entry.url), entry);
}
