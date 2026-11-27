import { createHash } from "node:crypto";
import { chmod, copyFile, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fetchCaseCatalogue, fetchRecentRegulations, fetchRegulation } from "./china-legal-publications.mjs";

const output = resolve(process.argv[2] || process.env.MIKE_CN_LEGAL_DB || join(homedir(), ".local/share/mike-cn/legal.sqlite"));
const original = await stat(output);
const stage = await mkdtemp(join(dirname(output), ".mike-cn-sync-"));
const nextPath = join(stage, "legal.sqlite");
const checkedAt = new Date().toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date(checkedAt));

function saveRegulations(db, updates) {
  const findWork = db.prepare("SELECT work_id FROM laws WHERE title = ? ORDER BY effective_at DESC LIMIT 1");
  const insertLaw = db.prepare("INSERT OR IGNORE INTO laws VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const insertName = db.prepare("INSERT OR IGNORE INTO law_names VALUES (?, ?)");
  const insertArticle = db.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?)");
  const retireSuperseded = db.prepare(
    "UPDATE laws SET status='amended' WHERE work_id=? AND id<>? AND status='current' AND effective_at IS NOT NULL AND effective_at<?",
  );
  const checkSource = db.prepare("UPDATE laws SET source_checked_at=?, status=? WHERE id=? AND status IN ('current','pending_effective','unknown')");
  let added = 0;
  for (const { entry, articles } of updates.sort((first, second) => first.entry.published.localeCompare(second.entry.published))) {
    const hash = createHash("sha256").update(articles.map((article) => article.text).join("\n\n")).digest("hex");
    const id = "moj:" + entry.key + ":" + hash.slice(0, 16);
    const work = findWork.get(entry.title)?.work_id ?? "moj-work:" + entry.key;
    const status = entry.effective ? entry.effective <= today ? "current" : "pending_effective" : "unknown";
    const notice = articles.flatMap((item) => item.text.match(/国务院令第\s*\d+\s*号/u) ?? [])[0] ?? null;
    if (insertLaw.run(id, work, entry.title, "admin_regulation", "国务院", notice, entry.published,
      entry.effective, null, status, entry.url, checkedAt, hash).changes) {
      insertName.run(entry.title.normalize("NFKC"), id);
      articles.forEach((article, index) => insertArticle.run(id, article.number, article.label, article.text, index));
      added++;
    } else {
      checkSource.run(checkedAt, status, id);
    }
    if (status === "current") retireSuperseded.run(work, id, entry.effective);
  }
  // The catalogue may publish a future effective date. Crossing it does not
  // require overwriting or re-fetching the same version's verbatim text.
  db.prepare("UPDATE laws SET status='current' WHERE id LIKE 'moj:%' AND status='pending_effective' AND effective_at<=?").run(today);
  db.exec("UPDATE laws AS old SET status='amended' WHERE old.status='current' AND EXISTS (" +
    "SELECT 1 FROM laws newer WHERE newer.work_id=old.work_id AND newer.id LIKE 'moj:%' AND newer.status='current' " +
    "AND newer.effective_at>old.effective_at)");
  return added;
}

try {
  await copyFile(output, nextPath);
  await chmod(nextPath, 0o600);
  const db = new DatabaseSync(nextPath);
  try {
    const info = db.prepare("SELECT value FROM library_info WHERE key = ?");
    const since = info.get("moj_latest_published")?.value ?? info.get("law_snapshot")?.value;
    if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("The existing library has no valid law snapshot date");
    const [recent, cases] = await Promise.all([fetchRecentRegulations(since), fetchCaseCatalogue()]);
    const updates = [];
    for (const entry of recent) updates.push({ entry, articles: await fetchRegulation(entry) });

    db.exec("BEGIN");
    const added = saveRegulations(db, updates);
    if (added) db.exec("INSERT INTO article_search(article_search) VALUES ('rebuild')");
    const saveCase = db.prepare("INSERT INTO cases VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET " +
      "title=excluded.title, date=excluded.date, url=excluded.url WHERE title<>excluded.title OR date IS NOT excluded.date OR url<>excluded.url");
    let caseChanges = 0;
    for (const item of cases) caseChanges += Number(saveCase.run(item.id, item.title, item.date, item.url).changes);
    const setInfo = db.prepare("INSERT INTO library_info VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    setInfo.run("moj_latest_published", recent[0]?.published ?? since);
    setInfo.run("moj_checked_at", checkedAt);
    setInfo.run("case_checked_at", checkedAt);
    db.exec("COMMIT");
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw new Error("The updated SQLite snapshot failed its integrity check");
    console.log(JSON.stringify({ administrativeRegulationsAdded: added, regulationPublicationsChecked: recent.length,
      caseChanges, casePublicationsChecked: cases.length, checkedAt }));
  } finally {
    db.close();
  }
  const current = await stat(output);
  if (current.ino !== original.ino || current.mtimeMs !== original.mtimeMs) {
    throw new Error("The library changed while this update was preparing; retry against the new file");
  }
  await chmod(nextPath, original.mode & 0o777);
  await rename(nextPath, output);
} finally {
  await rm(stage, { force: true, recursive: true });
}
