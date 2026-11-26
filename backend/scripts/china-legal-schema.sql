CREATE TABLE library_info (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE laws (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  title TEXT NOT NULL,
  level TEXT,
  issuing_body TEXT,
  document_number TEXT,
  released_at TEXT,
  effective_at TEXT,
  repealed_at TEXT,
  status TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_checked_at TEXT,
  source_hash TEXT
);
CREATE INDEX law_versions ON laws(work_id, effective_at);

CREATE TABLE law_names (
  name TEXT NOT NULL,
  law_id TEXT NOT NULL,
  PRIMARY KEY (name, law_id)
);

CREATE TABLE articles (
  law_id TEXT NOT NULL,
  number TEXT NOT NULL,
  number_display TEXT NOT NULL,
  text TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX article_positions ON articles(law_id, position);
CREATE VIRTUAL TABLE article_search USING fts5(text, content='articles', tokenize='trigram');

CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT,
  url TEXT NOT NULL UNIQUE
);
