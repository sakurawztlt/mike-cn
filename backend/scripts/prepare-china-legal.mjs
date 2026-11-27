import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, closeSync, existsSync, openSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { casesUrl, fetchCaseCatalogue } from "./china-legal-publications.mjs";

const snapshot = "2026-09-30";
const archiveName = `chinalaw-public-${snapshot}-sqlite.tar.gz`;
const snapshotUrl = `https://github.com/nh59yytyd5-dev/chinalaw-cli/releases/download/v0.7.1/${archiveName}`;
const archiveHash = "883df3177b553d5918a383c8511d1e6a56a5228668183df11f518e803c795011";
const schema = await readFile(new URL("./china-legal-schema.sql", import.meta.url), "utf8");

async function downloadArchive(path) {
  const response = await fetch(snapshotUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`Snapshot download failed (HTTP ${response.status})`);
  await pipeline(response.body, createWriteStream(path));
}

async function verifyArchive(path) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  if (hash.digest("hex") !== archiveHash) throw new Error("The public snapshot did not match its pinned SHA-256");
}

function extract(path, filename, destination) {
  // Each checksum-verified member is written to our own staging path.
  const fd = openSync(destination, "wx");
  try {
    const result = spawnSync("tar", ["-xOf", path, `chinalaw-public-${snapshot}-sqlite/${filename}`], {
      stdio: ["ignore", fd, "inherit"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Could not extract ${filename} from the snapshot`);
  } finally {
    closeSync(fd);
  }
}

function importSnapshot(output, source) {
  const laws = output.prepare(`INSERT INTO laws VALUES (${Array(13).fill("?").join(",")})`);
  const names = output.prepare("INSERT OR IGNORE INTO law_names VALUES (?, ?)");
  const articles = output.prepare("INSERT INTO articles VALUES (?, ?, ?, ?, ?)");
  const lawIds = new Set();
  for (const law of source.prepare("SELECT * FROM laws").iterate()) {
    if (typeof law.source_url !== "string" || !law.source_url.startsWith("https://flk.npc.gov.cn/")) continue;
    laws.run(law.id, law.work_id, law.title, law.level, law.issuing_body, law.document_number, law.released_at,
      law.effective_at, law.repealed_at, law.status, law.source_url, law.source_checked_at, law.source_hash);
    lawIds.add(law.id);
    for (const name of [law.title, law.short_title, ...(JSON.parse(law.aliases || "[]"))]) {
      if (typeof name === "string" && name.trim()) names.run(name.trim().normalize("NFKC"), law.id);
    }
  }
  for (const article of source.prepare("SELECT law_id, number, number_display, text, position FROM articles").iterate()) {
    if (lawIds.has(article.law_id) && typeof article.text === "string" && article.text.trim()) {
      articles.run(article.law_id, article.number, article.number_display, article.text, article.position);
    }
  }
  output.exec("INSERT INTO article_search(article_search) VALUES ('rebuild')");
}

const output = resolve(process.argv[2] || process.env.MIKE_CN_LEGAL_DB || join(homedir(), ".local/share/mike-cn/legal.sqlite"));
if (existsSync(output)) throw new Error("The legal library already exists; use sync:cn-legal to keep historical editions");
await mkdir(dirname(output), { recursive: true });
const stage = await mkdtemp(join(dirname(output), ".mike-cn-legal-"));
try {
  const suppliedArchive = process.argv[3];
  const archive = suppliedArchive ? resolve(suppliedArchive) : join(stage, archiveName);
  if (!suppliedArchive) await downloadArchive(archive);
  await verifyArchive(archive);
  const sourcePath = join(stage, "snapshot.sqlite");
  extract(archive, "library.db", sourcePath);
  extract(archive, "NOTICE.md", join(stage, "NOTICE.md"));
  extract(archive, "LICENSE", join(stage, "LICENSE"));
  const cases = await fetchCaseCatalogue();
  const databasePath = join(stage, "legal.sqlite");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const database = new DatabaseSync(databasePath);
  try {
    source.exec("PRAGMA trusted_schema = OFF");
    database.exec(schema);
    database.exec("BEGIN");
    importSnapshot(database, source);
    const addCase = database.prepare("INSERT INTO cases VALUES (?, ?, ?, ?)");
    for (const item of cases) addCase.run(item.id, item.title, item.date, item.url);
    const info = database.prepare("INSERT INTO library_info VALUES (?, ?)");
    info.run("law_snapshot", snapshot);
    info.run("law_source", snapshotUrl);
    info.run("law_sha256", archiveHash);
    info.run("law_notice", await readFile(join(stage, "NOTICE.md"), "utf8"));
    info.run("law_license", await readFile(join(stage, "LICENSE"), "utf8"));
    info.run("case_catalogue", casesUrl);
    info.run("case_checked_at", new Date().toISOString());
    database.exec("COMMIT");
    const lawCount = database.prepare("SELECT count(*) AS count FROM laws").get().count;
    const articleCount = database.prepare("SELECT count(*) AS count FROM articles").get().count;
    if (lawCount < 2_000 || articleCount < 70_000) throw new Error("The prepared law library is incomplete");
    console.log(`Prepared ${lawCount} law versions, ${articleCount} articles and ${cases.length} court publications`);
  } finally {
    source.close();
    database.close();
  }
  await link(databasePath, output);
  console.log(output);
} finally {
  await rm(stage, { force: true, recursive: true });
}
