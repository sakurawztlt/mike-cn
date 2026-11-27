import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export const CHINA_LEGAL_ID_PREFIX = "cn-legal:";

type LawVersion = {
  id: string;
  work_id: string;
  title: string;
  level: string | null;
  issuing_body: string | null;
  document_number: string | null;
  released_at: string | null;
  effective_at: string | null;
  repealed_at: string | null;
  status: string;
  source_url: string;
  source_checked_at: string | null;
  next_effective_at: string | null;
};

type CasePublication = { id: string; title: string; date: string | null; url: string };
type Article = { number: string; number_display: string; text: string };

const LAW_RECORD = `l.*, (
  SELECT min(v.effective_at) FROM laws v
  WHERE v.work_id = l.work_id AND v.effective_at > l.effective_at AND v.status <> 'unknown'
) AS next_effective_at`;

const STATUS_LABELS: Record<string, string> = {
  current: "快照标为现行",
  amended: "历史修订版本",
  repealed: "已废止版本",
  pending_effective: "快照标为尚未施行",
  unknown: "效力待核验",
};

let opened: { path: string; version: string; db: DatabaseSync } | undefined;

/** The importer swaps a complete read-only snapshot; each request sees one version. */
export function getChinaLegalLibrary(): DatabaseSync | undefined {
  const path = process.env.MIKE_CN_LEGAL_DB || join(homedir(), ".local/share/mike-cn/legal.sqlite");
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat?.isFile()) return undefined;
  const version = [stat.dev, stat.ino, stat.mtimeMs].join(":");
  if (opened?.path === path && opened.version === version) return opened.db;
  const { DatabaseSync: OpenDatabase } = require("node:sqlite") as typeof import("node:sqlite");
  const db = new OpenDatabase(path, { readOnly: true });
  db.exec("PRAGMA trusted_schema = OFF");
  opened?.db.close();
  opened = { path, version, db };
  return db;
}

function libraryValue(db: DatabaseSync, key: string): string | null {
  return (db.prepare("SELECT value FROM library_info WHERE key = ?").get(key)?.value as string | undefined) ?? null;
}

export function chinaLegalCoverage(db: DatabaseSync) {
  return { law_snapshot: libraryValue(db, "law_snapshot"), moj_checked_at: libraryValue(db, "moj_checked_at"),
    case_checked_at: libraryValue(db, "case_checked_at") };
}

function versionEnd(law: LawVersion) {
  const dates = [law.repealed_at, law.next_effective_at].filter((value): value is string => !!value);
  return dates.sort()[0] ?? null;
}

function timeStatus(law: LawVersion, asOf: string, snapshot: string | null) {
  if (law.effective_at && law.effective_at > asOf) return "当日尚未施行";
  const end = versionEnd(law);
  if (end && end <= asOf) return "当日已废止或已有后续版本施行";
  if (!law.effective_at || law.status === "unknown" || law.status === "pending_effective" ||
      (law.status === "repealed" && !law.repealed_at) || (law.status === "amended" && !end)) {
    return "当日效力待核验";
  }
  const editionChecked = law.id.startsWith("moj:") ? law.source_checked_at?.slice(0, 10) : snapshot;
  if (!editionChecked || asOf > editionChecked) return "目标日期超出已核验范围，须核对该日效力";
  return "当日版本候选，仍须核对过渡规定";
}

export function chinaLawCitation(law: LawVersion, asOf?: string, snapshot?: string | null) {
  return {
    source_id: `${CHINA_LEGAL_ID_PREFIX}law:${law.id}`,
    kind: "legislation" as const,
    title: law.title,
    url: law.source_url,
    level: law.level,
    issuing_body: law.issuing_body,
    document_number: law.document_number,
    released_at: law.released_at,
    effective_at: law.effective_at,
    repealed_at: law.repealed_at,
    next_version_effective_at: law.next_effective_at,
    snapshot_status: STATUS_LABELS[law.status] ?? STATUS_LABELS.unknown,
    ...(asOf && { as_of: asOf, as_of_status: timeStatus(law, asOf, snapshot ?? null) }),
  };
}

export function chinaCaseCitation(item: CasePublication) {
  return {
    source_id: `${CHINA_LEGAL_ID_PREFIX}case:${item.id}`,
    kind: "guiding_case_publication" as const,
    title: item.title,
    url: item.url,
    published_at: item.date,
  };
}

function normalizedName(value: string) {
  return value.normalize("NFKC").trim().replace(/^《(.+)》$/, "$1");
}

function findLawVersions(db: DatabaseSync, name: string, partial = false) {
  const predicate = partial ? "instr(n.name, ?) > 0" : "n.name = ?";
  return db.prepare(`SELECT ${LAW_RECORD} FROM laws l WHERE l.work_id IN (
    SELECT DISTINCT named.work_id FROM law_names n JOIN laws named ON named.id = n.law_id
    WHERE ${predicate} LIMIT 8
  ) ORDER BY l.status = 'current' DESC, l.effective_at DESC, l.released_at DESC LIMIT 40`)
    .all(name) as unknown as LawVersion[];
}

export function findChinaLawArticle(db: DatabaseSync, id: string, article: string) {
  const number = article.normalize("NFKC").trim().replace(/^第(\d+)条(?:之(\d+))?$/, (_, main, part) =>
    part ? `${main}-${part}` : main);
  return db.prepare(`SELECT number, number_display, text FROM articles
    WHERE law_id = ? AND (number = ? OR number_display = ?) ORDER BY position LIMIT 1`)
    .get(id, number, number) as unknown as Article | undefined;
}

function searchLawBody(db: DatabaseSync, terms: string[]) {
  const indexed = terms.filter((term) => [...term].length >= 3);
  const ftsQuery = indexed.map((term) => `"${term.replaceAll('"', '""')}"`).join(" AND ");
  const literals = terms.filter((term) => !indexed.includes(term));
  const table = indexed.length ? "article_search JOIN articles a ON a.rowid = article_search.rowid" : "articles a";
  const predicates = [...(indexed.length ? ["article_search MATCH ?"] : []), ...literals.map(() => "instr(a.text, ?) > 0")];
  const rows = db.prepare(`SELECT ${LAW_RECORD}, a.number_display AS article, a.text AS article_text
    FROM ${table} JOIN laws l ON l.id = a.law_id WHERE ${predicates.join(" AND ")}
    ORDER BY l.status = 'current' DESC, ${indexed.length ? "article_search.rank," : ""} l.effective_at DESC LIMIT 12`)
    .all(...(indexed.length ? [ftsQuery] : []), ...literals) as unknown as (LawVersion & { article: string; article_text: string })[];
  return rows.map((row) => ({ ...chinaLawCitation(row), article: row.article, text_excerpt: row.article_text.slice(0, 180) }));
}

export function searchChinaLegalLibrary(db: DatabaseSync, args: {
  query: string;
  kind: "law" | "case" | "all";
  law?: string;
  article?: string;
  asOf?: string;
}) {
  const coverage = chinaLegalCoverage(db);
  const name = normalizedName(args.law || args.query);
  const terms = args.query.trim().normalize("NFKC").split(/\s+/).filter(Boolean).slice(0, 8);
  let laws = args.kind === "case" ? [] : findLawVersions(db, name);
  const matchedName = laws.length > 0;
  if (args.kind !== "case" && !laws.length && name) laws = findLawVersions(db, name, true);
  if (args.asOf) {
    const date = args.asOf;
    // Keep all known versions inspectable. Prioritize the last known version
    // that had begun by the requested date, with its limits shown explicitly.
    const order = (law: LawVersion) => !law.effective_at ? 2 : law.effective_at > date ? 1 : 0;
    laws.sort((first, second) => order(first) - order(second) ||
      (second.effective_at ?? "").localeCompare(first.effective_at ?? ""));
  }
  const lawHits = laws.map((law) => ({
    ...chinaLawCitation(law, args.asOf, coverage.law_snapshot),
    ...(args.article && { article_found: !!findChinaLawArticle(db, law.id, args.article) }),
  }));
  const caseTerms = terms.map((term) => term.replace(/^指导(?:性)?(案例\d+号)$/, "$1"));
  const cases = args.kind === "law" || !caseTerms.length ? [] : db.prepare(`SELECT * FROM cases
    WHERE ${caseTerms.map(() => "instr(title, ?) > 0").join(" AND ")} ORDER BY date DESC, id DESC LIMIT 12`)
    .all(...caseTerms) as unknown as CasePublication[];
  const bodyHits = args.kind !== "case" && !matchedName && !args.law && terms.length
    ? searchLawBody(db, terms) : [];
  return { coverage, hits: [...lawHits, ...bodyHits, ...cases.map(chinaCaseCitation)] };
}

export function loadChinaLaw(db: DatabaseSync, id: string) {
  const law = db.prepare(`SELECT ${LAW_RECORD} FROM laws l WHERE l.id = ?`).get(id) as unknown as LawVersion | undefined;
  if (!law) return undefined;
  const articles = db.prepare("SELECT number, number_display, text FROM articles WHERE law_id = ? ORDER BY position")
    .all(id) as unknown as Article[];
  if (!articles.length) return undefined;
  return { law, articles };
}

export function loadChinaCase(db: DatabaseSync, id: string) {
  return db.prepare("SELECT * FROM cases WHERE id = ?").get(id) as unknown as CasePublication | undefined;
}

/** A URL can only resolve to the exact published item already in our index. */
export function chinaLegalIdForUrl(db: DatabaseSync, url: string) {
  const law = db.prepare("SELECT id FROM laws WHERE source_url = ?").get(url);
  if (law) return `${CHINA_LEGAL_ID_PREFIX}law:${law.id}`;
  const item = db.prepare("SELECT id FROM cases WHERE url = ?").get(url);
  return item ? `${CHINA_LEGAL_ID_PREFIX}case:${item.id}` : undefined;
}

export function formatChinaLawArticle(article: Article) {
  return article.text.startsWith(article.number_display) ? article.text : `${article.number_display}　${article.text}`;
}
