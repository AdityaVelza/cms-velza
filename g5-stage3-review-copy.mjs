// G5 Stage 3 (revision 7) - authenticated authorization test for the single "Velza Content Manager" test account.
// LOCAL ONLY: the target is fixed to http://127.0.0.1:1337 and cannot be overridden. No API token is used.
//
// Secrets: the password is read with hidden input and cleared after login; the session token exists only in
// memory. Neither is printed, written to disk or sent anywhere except the local CMS.
//
// Database: the local SQLite file is opened READ-ONLY. Before any request, every table is snapshotted row by row.
// After the last network request, every table is compared fail-closed: a modified or deleted pre-existing row, or an
// added row that a narrow rule cannot attribute to this run, fails the run (DB1-DB3).
//
// Content: creates only "G5 TEST –" drafts (1 Blog, 1 News) and one 1x1 "G5 TEST" image. Nothing is deleted or cleaned
// up by this script; test records are left as unpublished drafts.
//
// Payload safety - what each forbidden-operation request would do if authorization wrongly succeeded (verified against
// the installed Strapi 5.58.0 source):
//  U3, W2  create with a relation to a non-existent document: rejected before insert (document-service data-ids.js)
//  D1-D4   delete / bulkDelete a non-existent document id: route policy checks explorer.delete first; nothing to delete
//  G1      create Region with an empty body: Region has no draft & publish, so required fields are enforced -> 400
//  G2, G3  non-existent Region id: nothing to update or delete
//  M2, M3  own test image only (no-op metadata / metadata-only update); M4 non-existent file id; M5 empty lists
//  A11-A19 empty bodies, each rejected by the endpoint's validator (A13 is a read, see below)
//  A13     GET the test role's permissions (read only; role id resolved by name, never a hard-coded id)
//  A20     GET own permissions and assert no administration, settings, view-configuration or out-of-scope content
//          action is granted (read only; replaces the former self-escalation request - no request in this script can
//          change a role, a role assignment or a permission)
//
// Halt: once a check fails, `halted` is set and call() refuses every POST/PUT/PATCH/DELETE except two safety actions:
// unpublishing this run's own Blog/News document, and logging out this script's own device.
//
// Finalization: every request has a timeout and no write is retried. Each finalization step (cleanup per document,
// final checks, health, logout, replay, database comparison, results file) runs on its own; a failure is recorded as
// UNEXPECTED and the remaining steps still run. Any failure or incomplete step gives VERDICT FAIL and exit code 1.
// A write that failed at network level (timeout, reset) is listed for a manual check - the server may have completed
// it - and also fails the run.
//
// Preconditions for a clean database comparison: nobody else uses the admin panel or the test account during the run
// (other admin activity changes sessions or content and is reported as unexpected, not ignored).
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:1337';
const CMS_DIR = 'C:/Users/ADMIN/Desktop/cms_velza_new/velza-cms';
const DB_PATH = `${CMS_DIR}/.tmp/manual-test.db`;
const TEST_EMAIL = 'g5-content-manager@example.test';
const EXPECTED_ROLE = 'Velza Content Manager';
const RESULTS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'g5-stage3-results.json');
const BLOG = 'api::blog.blog';
const NEWS = 'api::news-article.news-article';
const REGION = 'api::region.region';
const NEWSLETTER = 'api::newsletter-issue.newsletter-issue';
const AUTHOR = 'api::author.author';
const CATEGORY = 'api::category.category';
const REQUEST_TIMEOUT_MS = 20000; // per request, including reading the response body
const CM ='/content-manager/collection-types';
const FAKE_DOC_ID = 'g5testnotarealdocumentid'; // preflight confirms it matches no record
const FAKE_FILE_ID = 2147483000; // preflight confirms it matches no record

if (new URL(BASE).host !== '127.0.0.1:1337') throw new Error('Refusing to run: target must be 127.0.0.1:1337');
if (!process.stdin.isTTY) throw new Error('Refusing to run without an interactive terminal (needed for hidden password input).');
if (!existsSync(DB_PATH)) throw new Error(`Refusing to run: ${DB_PATH} not found`);

// ------------------------------------------------------------------------------------------- read-only DB
const Database = createRequire(`${CMS_DIR}/package.json`)('better-sqlite3');
const openDb = () => new Database(DB_PATH, { readonly: true, fileMustExist: true });
const listTables = (db) => db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all().map((t) => t.name);
const columnsOf = (db, t) => db.prepare(`pragma table_info("${t}")`).all().map((c) => c.name);
const rowHash = (row) => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const toMs = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? (/^\d+$/.test(v) ? Number(v) : Date.parse(v)) : NaN);

// Table and column names verified from the project schemas and the installed Strapi naming rules
// (@strapi/database identifiers: <collection>_<attribute>_lnk, <singular>_id, <collection>_cmps, files_related_mph).
const REQUIRED_COLUMNS = {
  blogs: ['id', 'document_id', 'published_at', 'title'],
  news_articles: ['id', 'document_id', 'published_at', 'title'],
  newsletter_issues: ['id', 'document_id'],
  regions: ['id', 'document_id'],
  authors: ['id'], categories: ['id'],
  files: ['id', 'name'],
  files_related_mph: ['id', 'file_id', 'related_id', 'related_type', 'field'],
  files_folder_lnk: ['id', 'file_id'],
  upload_folders: ['id'], upload_folders_parent_lnk: ['id'],
  blogs_regions_lnk: ['id', 'blog_id', 'region_id'],
  news_articles_regions_lnk: ['id', 'news_article_id', 'region_id'],
  newsletter_issues_regions_lnk: ['id'],
  blogs_author_lnk: ['id'], blogs_category_lnk: ['id'], news_articles_author_lnk: ['id'], news_articles_category_lnk: ['id'],
  blogs_cmps: ['id', 'entity_id', 'cmp_id', 'component_type', 'field'],
  news_articles_cmps: ['id', 'entity_id', 'cmp_id', 'component_type', 'field'],
  newsletter_issues_cmps: ['id', 'entity_id', 'cmp_id', 'component_type'],
  components_shared_seos: ['id', 'meta_title'], components_shared_faq_items: ['id'],
  strapi_sessions: ['id', 'user_id', 'device_id', 'origin', 'expires_at', 'absolute_expires_at'],
  admin_users: ['id', 'email'], admin_roles: ['id', 'name'], admin_users_roles_lnk: ['id', 'user_id', 'role_id'],
  admin_permissions: ['id'], admin_permissions_role_lnk: ['id'],
  strapi_api_tokens: ['id'], strapi_api_token_permissions: ['id'], strapi_transfer_tokens: ['id'], strapi_transfer_token_permissions: ['id'],
  strapi_core_store_settings: ['id'], strapi_webhooks: ['id'],
  up_roles: ['id'], up_permissions: ['id'], up_users: ['id'],
};
// Exist only when the matching feature is active. Covered by the all-table snapshot when present; rule columns checked.
const OPTIONAL_COLUMNS = {
  strapi_history_versions: ['id', 'content_type', 'related_document_id'],
  strapi_audit_logs: ['id'], strapi_audit_logs_user_lnk: ['id', 'audit_log_id', 'user_id'],
  blogs_strapi_stage_lnk: ['id', 'blog_id'], news_articles_strapi_stage_lnk: ['id', 'news_article_id'],
  strapi_releases: ['id'], strapi_release_actions: ['id'], strapi_workflows: ['id'], strapi_workflows_stages: ['id'],
};
// The installed i18n schema declares collectionName "locales"; "i18n_locale" is the documented v5 table name.
const LOCALE_TABLES = ['i18n_locale', 'locales'];

const preflight = () => {
  const db = openDb();
  try {
    const tables = new Set(listTables(db));
    const problems = [];
    const checkColumns = (t, cols) => {
      const have = new Set(columnsOf(db, t));
      const missing = cols.filter((c) => !have.has(c));
      if (missing.length) problems.push(`${t} lacks column(s) ${missing.join(', ')}`);
    };
    for (const [t, cols] of Object.entries(REQUIRED_COLUMNS)) tables.has(t) ? checkColumns(t, cols) : problems.push(`missing table ${t}`);
    for (const [t, cols] of Object.entries(OPTIONAL_COLUMNS)) if (tables.has(t)) checkColumns(t, cols);
    const localeTables = LOCALE_TABLES.filter((t) => tables.has(t));
    if (!localeTables.length) problems.push(`missing locale table (${LOCALE_TABLES.join(' or ')})`);
    if (problems.length) throw new Error(`Database schema differs from the verified schema: ${problems.join('; ')}`);

    const users = db.prepare('select id from admin_users where email = ?').all(TEST_EMAIL);
    if (users.length !== 1) throw new Error(`Expected exactly one admin user ${TEST_EMAIL}, found ${users.length}`);
    const userRoles = db.prepare('select r.id, r.name from admin_roles r join admin_users_roles_lnk l on l.role_id = r.id where l.user_id = ?').all(users[0].id);
    if (userRoles.length !== 1 || userRoles[0].name !== EXPECTED_ROLE) throw new Error(`Test account roles are ${JSON.stringify(userRoles.map((r) => r.name))}`);
    const byName = db.prepare('select id from admin_roles where name = ?').all(EXPECTED_ROLE);
    if (byName.length !== 1 || byName[0].id !== userRoles[0].id) throw new Error(`Role "${EXPECTED_ROLE}" is not unique or does not match the test account`);
    for (const t of ['blogs', 'news_articles', 'regions', 'newsletter_issues']) {
      if (db.prepare(`select count(*) n from "${t}" where document_id = ?`).get(FAKE_DOC_ID).n) throw new Error(`FAKE_DOC_ID exists in ${t}`);
    }
    if (db.prepare('select count(*) n from files where id = ?').get(FAKE_FILE_ID).n) throw new Error('FAKE_FILE_ID exists in files');
    return { userId: users[0].id, roleId: userRoles[0].id, localeTables, optionalPresent: Object.keys(OPTIONAL_COLUMNS).filter((t) => tables.has(t)) };
  } finally {
    db.close();
  }
};

// Every table, every row. Rows are kept only as hashes, except session rows (expiry is needed to classify deletions).
const snapshotAll = () => {
  const db = openDb();
  try {
    const snap = { takenAt: Date.now(), tables: {} };
    for (const t of listTables(db)) {
      const hasId = columnsOf(db, t).includes('id');
      const rows = db.prepare(`select * from "${t}"`).all();
      snap.tables[t] = hasId
        ? { hasId, count: rows.length, byId: new Map(rows.map((r) => [String(r.id), rowHash(r)])),
          raw: t === 'strapi_sessions' ? new Map(rows.map((r) => [String(r.id), r])) : null }
        : { hasId, count: rows.length, multiset: rows.map(rowHash).sort() };
    }
    return snap;
  } finally {
    db.close();
  }
};

// Allowlist for rows ADDED during the run. A table without a rule is protected: any added row is unexpected.
// `c` holds this run's identifiers. Ownership is by precise ids: the final DRAFT row ids of this run's two documents
// (unpublish deletes the published version and all its children in 5.58, so a row pointing at any other id is a
// problem), this run's file id, and components created during the run. Titles and names are extra checks only.
const ADDED_ROW_RULES = {
  blogs: (r, c) => r.document_id === c.blogDocId && r.published_at == null && r.title === c.blogTitle,
  news_articles: (r, c) => r.document_id === c.newsDocId && r.published_at == null && r.title === c.newsTitle,
  files: (r, c) => r.id === c.fileId && r.name === c.fileName,
  files_related_mph: (r, c) => r.file_id === c.fileId && r.field === 'featuredImage'
    && ((r.related_type === BLOG && c.blogIds.has(r.related_id)) || (r.related_type === NEWS && c.newsIds.has(r.related_id))),
  files_folder_lnk: (r, c) => r.file_id === c.fileId,
  blogs_regions_lnk: (r, c) => c.blogIds.has(r.blog_id) && c.regionIds.has(r.region_id),
  news_articles_regions_lnk: (r, c) => c.newsIds.has(r.news_article_id) && c.regionIds.has(r.region_id),
  blogs_cmps: (r, c) => c.blogIds.has(r.entity_id) && r.component_type === 'shared.seo' && r.field === 'seo' && c.addedSeoIds.has(r.cmp_id),
  news_articles_cmps: (r, c) => c.newsIds.has(r.entity_id) && r.component_type === 'shared.seo' && r.field === 'seo' && c.addedSeoIds.has(r.cmp_id),
  // A new SEO component must be referenced by exactly one component link in the whole database: this run's draft.
  components_shared_seos: (r, c) => {
    const refs = c.seoRefs.get(r.id) ?? [];
    if (refs.length !== 1 || refs[0].field !== 'seo') return false;
    const owners = refs[0].table === 'blogs_cmps' ? c.blogIds : refs[0].table === 'news_articles_cmps' ? c.newsIds : null;
    return !!owners && owners.has(refs[0].entity_id) && c.seoTitles.has(r.meta_title);
  },
  // Review workflows (if active) assign a stage to new entries.
  blogs_strapi_stage_lnk: (r, c) => c.blogIds.has(r.blog_id),
  news_articles_strapi_stage_lnk: (r, c) => c.newsIds.has(r.news_article_id),
  // Content history (if active) records versions of this run's documents.
  strapi_history_versions: (r, c) => (r.content_type === BLOG && r.related_document_id === c.blogDocId)
    || (r.content_type === NEWS && r.related_document_id === c.newsDocId),
  // Audit logs (if active): entries linked to the test account, which only this script uses.
  strapi_audit_logs: (r, c) => c.ownAuditIds.has(r.id),
  strapi_audit_logs_user_lnk: (r, c) => r.user_id === c.myId && c.addedAuditIds.has(r.audit_log_id),
};
// Allowlist for pre-existing rows DELETED during the run. Strapi removes sessions whose lifetime has ended.
// A null absolute expiry falls back to the idle expiry; a row with neither is never an allowed deletion.
const DELETED_ROW_RULES = {
  strapi_sessions: (r, checkedAt) => {
    if (!r) return false;
    const idle = toMs(r.expires_at);
    const absolute = r.absolute_expires_at == null ? idle : toMs(r.absolute_expires_at);
    return Math.min(idle, absolute) <= checkedAt;
  },
};

const compareDatabase = (before, c) => {
  const db = openDb();
  try {
    const checkedAt = Date.now();
    const afterTables = listTables(db);
    const idsFor = (table, documentId, where = '') => new Set(documentId
      ? db.prepare(`select id from "${table}" where document_id = ?${where}`).all(documentId).map((r) => r.id) : []);
    c.blogIds = idsFor('blogs', c.blogDocId, ' and published_at is null');
    c.newsIds = idsFor('news_articles', c.newsDocId, ' and published_at is null');
    c.regionIds = idsFor('regions', c.regionDocId);
    const seoBefore = before.tables.components_shared_seos;
    c.addedSeoIds = new Set(db.prepare('select id from components_shared_seos').all().map((r) => r.id).filter((id) => !seoBefore?.byId.has(String(id))));
    c.seoRefs = new Map();
    for (const t of afterTables.filter((n) => n.endsWith('_cmps'))) {
      for (const r of db.prepare(`select entity_id, cmp_id, field from "${t}" where component_type = 'shared.seo'`).all()) {
        if (!c.seoRefs.has(r.cmp_id)) c.seoRefs.set(r.cmp_id, []);
        c.seoRefs.get(r.cmp_id).push({ table: t, entity_id: r.entity_id, field: r.field });
      }
    }
    c.addedAuditIds = new Set();
    c.ownAuditIds = new Set();
    if (afterTables.includes('strapi_audit_logs') && before.tables.strapi_audit_logs?.hasId) {
      for (const r of db.prepare('select id from strapi_audit_logs').all()) if (!before.tables.strapi_audit_logs.byId.has(String(r.id))) c.addedAuditIds.add(r.id);
    }
    if (afterTables.includes('strapi_audit_logs_user_lnk')) {
      for (const r of db.prepare('select audit_log_id, user_id from strapi_audit_logs_user_lnk').all()) if (r.user_id === c.myId) c.ownAuditIds.add(r.audit_log_id);
    }

    const problems = [];
    const tables = {};
    for (const t of [...new Set([...Object.keys(before.tables), ...afterTables])].sort()) {
      const b = before.tables[t];
      if (!b) { problems.push({ table: t, kind: 'table added' }); continue; }
      if (!afterTables.includes(t)) { problems.push({ table: t, kind: 'table removed' }); continue; }
      const rows = db.prepare(`select * from "${t}"`).all();
      const s = { before: b.count, after: rows.length, added: 0, addedAllowed: 0, deleted: 0, deletedAllowed: 0, modified: 0 };
      tables[t] = s;
      if (!b.hasId) {
        if (JSON.stringify(rows.map(rowHash).sort()) !== JSON.stringify(b.multiset)) problems.push({ table: t, kind: 'changed', reason: 'no id column; any difference is unexpected' });
        continue;
      }
      const seen = new Set();
      for (const r of rows) {
        const k = String(r.id);
        seen.add(k);
        if (b.byId.has(k)) {
          if (b.byId.get(k) !== rowHash(r)) { s.modified++; problems.push({ table: t, kind: 'modified', id: r.id }); }
          continue;
        }
        s.added++;
        const rule = ADDED_ROW_RULES[t];
        if (rule && rule(r, c)) { s.addedAllowed++; continue; }
        const reason = t === 'strapi_sessions' && r.device_id === c.deviceId ? "this script's session was not revoked by S1"
          : rule ? 'not attributable to this run' : 'protected table: no additions allowed';
        problems.push({ table: t, kind: 'added', id: r.id, reason });
      }
      for (const k of b.byId.keys()) {
        if (seen.has(k)) continue;
        s.deleted++;
        const rule = DELETED_ROW_RULES[t];
        if (rule && rule(b.raw?.get(k), checkedAt)) s.deletedAllowed++;
        else problems.push({ table: t, kind: 'deleted', id: Number(k) || k });
      }
    }
    // Exact end state for each created document: one draft row, one SEO component and its link, one region link and
    // one featured-image link; plus one file row.
    const missingExpected = [];
    const expectCount = (table, n, label) => { if ((tables[table]?.addedAllowed ?? 0) !== n) missingExpected.push(`${table}: expected ${n} ${label}, found ${tables[table]?.addedAllowed ?? 0}`); };
    const docs = (c.blogDocId ? 1 : 0) + (c.newsDocId ? 1 : 0);
    if (c.blogDocId) { expectCount('blogs', 1, 'Blog draft row'); expectCount('blogs_cmps', 1, 'Blog SEO link'); expectCount('blogs_regions_lnk', 1, 'Blog region link'); }
    if (c.newsDocId) { expectCount('news_articles', 1, 'News draft row'); expectCount('news_articles_cmps', 1, 'News SEO link'); expectCount('news_articles_regions_lnk', 1, 'News region link'); }
    if (docs) { expectCount('components_shared_seos', docs, 'SEO component(s)'); expectCount('files_related_mph', docs, 'featured-image link(s)'); }
    if (c.fileId) {
      const links = db.prepare('select related_type, related_id from files_related_mph where file_id = ?').all(c.fileId);
      for (const [docId, type, owners, label] of [[c.blogDocId, BLOG, c.blogIds, 'Blog'], [c.newsDocId, NEWS, c.newsIds, 'News']]) {
        if (!docId) continue;
        const n = links.filter((l) => l.related_type === type && owners.has(l.related_id)).length;
        if (n !== 1) missingExpected.push(`files_related_mph: expected 1 featured-image link for the ${label} draft, found ${n}`);
      }
    }
    if (c.fileId) expectCount('files', 1, 'file row');
    return { checkedAt: new Date(checkedAt).toISOString(), tablesCovered: Object.keys(tables).length, tables, problems, missingExpected };
  } finally {
    db.close();
  }
};
const dbHasDocument = (table, documentId) => {
  const db = openDb();
  try {
    return db.prepare(`select count(*) n from "${table}" where document_id = ?`).get(documentId).n > 0;
  } finally {
    db.close();
  }
};

// ---------------------------------------------------------------------------------------------- helpers
const askHidden = (prompt) => new Promise((resolve, reject) => {
  process.stdout.write(`${prompt}\n`); // newline-terminated so line-based capture (PowerShell | Tee-Object) shows it; input stays hidden
  const stdin = process.stdin;
  let value = '';
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); };
  // A pasted password arrives as one chunk, so each character is handled separately.
  const onData = (chunk) => {
    for (const ch of chunk) {
      if (ch === '\u0003') { done(); reject(new Error('Cancelled')); return; }
      if (ch === '\r' || ch === '\n') { done(); process.stdout.write('\n'); resolve(value); return; }
      if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue; }
      value += ch;
    }
  };
  stdin.on('data', onData);
});

let session = null; // access token, memory only
const results = [];
const timeline = [];
const cleanupFailures = [];
const finalizationErrors = [];
const uncertainWrites = []; // writes that failed at network level (timeout, reset); method + path only; the server may have completed them
let halted = null;

// The only writes permitted after a halt: unpublishing a Blog/News document (cleanup also checks it is this run's
// own) and logging out this script's device.
const SAFETY_WRITE = /^(\/content-manager\/collection-types\/(api::blog\.blog|api::news-article\.news-article)\/[^/?]+\/actions\/unpublish|\/admin\/logout)$/;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const call = async (method, path, { body, form, auth = true, token, safety = false } = {}) => {
  if (halted && MUTATING.has(method) && !(safety && SAFETY_WRITE.test(path))) {
    console.error(`BLOCKED   ${method} ${path} (halted: no further writes)`);
    return { status: 0, json: null, blocked: true };
  }
  const headers = { Accept: 'application/json' };
  const useToken = token ?? (auth ? session : null);
  if (useToken) headers.Authorization = `Bearer ${useToken}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  // The timeout also covers reading the body. A timed-out request rejects and is never retried.
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual', signal });
    let json = null;
    try { json = await res.json(); } catch (err) { if (signal.aborted) throw err; /* empty or non-JSON body */ }
    return { status: res.status, json };
  } catch (err) {
    if (MUTATING.has(method)) uncertainWrites.push(`${method} ${path} (${signal.aborted ? 'timed out' : 'network error'})`);
    throw err;
  }
};
const describeError = (err) => (err?.name === 'TimeoutError' || err?.name === 'AbortError' ? `request timed out after ${REQUEST_TIMEOUT_MS} ms` : err?.message ?? String(err));

// 401 = unauthenticated, 403 = forbidden. Anything not listed as expected is UNEXPECTED, including 404.
const classify = (s) => (s === 401 ? 'unauthenticated' : s === 403 ? 'forbidden' : s === 404 ? 'not found - needs verification'
  : s >= 200 && s < 300 ? 'success' : s >= 400 && s < 500 ? 'client error' : 'server error');
const record = (id, description, expected, actual, extra = {}) => {
  const ok = [].concat(expected).includes(actual);
  const row = { id, description, expected, actual, meaning: classify(actual), result: ok ? 'PASS' : 'UNEXPECTED', ...extra };
  results.push(row);
  console.log(`${ok ? 'PASS      ' : 'UNEXPECTED'}  ${id.padEnd(5)} ${String(actual).padEnd(4)} (expected ${[].concat(expected).join('/')})  ${description}${extra.note ? '  - ' + extra.note : ''}`);
  return ok;
};
// Every check below halts all further writes when its result is unexpected.
const checkOrHalt = (id, description, expected, actual, extra) => {
  if (!record(id, description, expected, actual, extra)) halted = halted || `${id} returned ${actual} (expected ${[].concat(expected).join('/')})`;
};
const expectStatus = async (id, description, expected, fn) => {
  if (halted) return null;
  const r = await fn();
  checkOrHalt(id, description, expected, r.status);
  return r;
};
const expectDenied = async (id, description, fn, verify) => {
  if (halted) return null;
  const r = await fn();
  const extra = {};
  if (verify) { const v = await verify(); extra.note = v.note; if (!v.ok) extra.stateCheck = 'FAILED'; }
  const ok = record(id, description, 403, r.status, extra) && extra.stateCheck !== 'FAILED';
  if (!ok) halted = halted || `${id} returned ${r.status}${extra.stateCheck ? ' and the state check failed' : ''} (expected 403)`;
  return r;
};
const expectInfo = async (id, description, expected, note, fn) => {
  if (halted) return;
  const r = await fn();
  record(id, description, expected, r.status, { note: `informational: ${note}` });
};
// Runs one finalization step in isolation: an exception (network error, timeout, local error) is recorded as an
// UNEXPECTED result and as a finalization error, and never prevents the following steps.
const finalStep = async (id, label, fn, onError) => {
  try {
    await fn();
  } catch (err) {
    const why = describeError(err);
    finalizationErrors.push(`${id}: ${why}`);
    if (onError) onError();
    record(id, `${label} - could not complete`, true, false, { note: why });
  }
};
const publicCount = async (type, slug) => {
  const r = await call('GET', `/api/${type}?filters[slug][$eq]=${encodeURIComponent(slug)}&status=draft&fields[0]=slug&fields[1]=publishedAt`, { auth: false });
  return { status: r.status, count: r.json?.data?.length ?? -1 };
};
// true / false, or null when the response carries no document (unreadable/empty body, or `data: {}` when no draft
// version exists): never read as "unpublished".
const isPublished = (r) => (!r.json?.data?.documentId ? null
  : !!(r.json.data.publishedAt || (r.json.meta?.availableStatus ?? []).some((s) => s.publishedAt)));

// Actions the test role must not hold (A20). Covers the denials expected by A1-A19, D1-D4, G1-G3, W1-W2, M2-M5, plus
// view/layout configuration, review workflows, releases, provider login, audit logs, marketplace and Author/Category
// writes. Action ids verified against the installed Strapi 5.58.0 action registrations.
const FORBIDDEN_ACTIONS = [
  /^admin::(users|roles)\./, /^admin::(api-tokens|admin-tokens|transfer\.tokens)\./, /^admin::webhooks\./, /^admin::project-settings\./,
  /^admin::review-workflows\./, /^admin::provider-login\./, /^admin::audit-logs\./, /^admin::marketplace\./, /^admin::debug-dump\./,
  /^plugin::content-type-builder\./, /^plugin::users-permissions\./, /^plugin::i18n\.locale\.(create|update|delete)$/,
  /^plugin::content-releases\./, /^plugin::content-manager\.(collection-types|single-types)\.configure-view$/,
  /^plugin::content-manager\.components\.configure-layout$/,
  /^plugin::upload\.settings\./, /^plugin::upload\.configure-view$/, /^plugin::upload\.assets\.(update|delete)$/, /^plugin::email\./,
];
const CONTENT_WRITE = /^plugin::content-manager\.explorer\.(create|update|delete|publish)$/;
const isForbiddenPermission = (p) => FORBIDDEN_ACTIONS.some((re) => re.test(p.action))
  || (p.action === 'plugin::content-manager.explorer.delete' && [BLOG, NEWS].includes(p.subject))
  || (p.subject === NEWSLETTER && p.action.startsWith('plugin::content-manager.explorer.'))
  || ([REGION, AUTHOR, CATEGORY].includes(p.subject) && CONTENT_WRITE.test(p.action));

const blocks = (text) => [{ type: 'paragraph', children: [{ type: 'text', text }] }];
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const NAMES = { blog: `G5 TEST – Blog ${stamp}`, news: `G5 TEST – News ${stamp}`, file: `G5 TEST – pixel ${stamp}`,
  blogSeo: `G5 TEST Blog ${stamp}`, newsSeo: `G5 TEST News ${stamp}` };
const FAKE_CONNECT = { regions: { connect: [{ documentId: FAKE_DOC_ID }] } }; // fails relation lookup before any insert

const created = {};
const published = new Set(); // test documents that may be published (model|documentId); cleanup re-checks each
const deviceId = randomUUID(); // logout is scoped to this device, so the browser profile's session is unaffected
let before = null;
let pre = null;
let regionDocId = null;
let verifyTestImage = null; // set after the test image is uploaded
const slugs = {};

// Publish, then unpublish immediately (no public request in between) to keep the public window minimal.
const publishWindow = async (prefix, model, documentId, label) => {
  if (halted) return;
  const key = `${model}|${documentId}`;
  published.add(key); // before the request, so a lost response still leads to a cleanup re-check
  const tPub = new Date().toISOString();
  const pub = await call('POST', `${CM}/${model}/${documentId}/actions/publish`, { body: {} });
  const publishedAt = pub.json?.data?.publishedAt ?? null;
  record(`${prefix}3`, `POST publish the ${label}`, [200, 201], pub.status, { note: `publishedAt=${publishedAt}` });
  if (![200, 201].includes(pub.status) || !publishedAt) { halted = halted || `${prefix}3 publish failed (${pub.status})`; return; }
  const tUnpubStart = new Date().toISOString();
  const unpub = await call('POST', `${CM}/${model}/${documentId}/actions/unpublish`, { body: {} });
  const tUnpub = new Date().toISOString();
  // The unpublish response describes the deleted published version, so the current state comes from a follow-up read.
  const state = await call('GET', `${CM}/${model}/${documentId}`);
  const stillPublished = state.status === 200 ? isPublished(state) : null;
  if (unpub.status === 200 && stillPublished === false) published.delete(key);
  record(`${prefix}4`, `POST unpublish the ${label} (immediately after publish)`, 200, unpub.status,
    { note: `deleted published version's publishedAt=${unpub.json?.data?.publishedAt ?? null}; follow-up read HTTP ${state.status}, document still published: ${stillPublished ?? 'unknown'}` });
  timeline.push({ document: label, documentId, publishRequestAt: tPub, publishedAt, unpublishRequestAt: tUnpubStart, unpublishedConfirmedAt: tUnpub,
    publicWindowMs: Date.parse(tUnpub) - Date.parse(tPub) });
  if (unpub.status !== 200) halted = halted || `${prefix}4 unpublish failed (${unpub.status})`;
  else if (stillPublished !== false) halted = halted || `${prefix}4 follow-up read could not confirm the ${label} is unpublished`;
};

// ---------------------------------------------------------------------------------------------- run
try {
  console.log(`G5 Stage 3 (rev 7) - target ${BASE} - account ${TEST_EMAIL}\n`);
  pre = preflight();
  console.log(`Preflight (read-only): schema verified; locale table ${pre.localeTables.join(', ')}; optional feature tables present: ${pre.optionalPresent.join(', ') || 'none'}.`);
  before = snapshotAll();
  console.log(`Read-only before-snapshot taken (${Object.keys(before.tables).length} tables, all rows).\n`);

  // 1. Unauthenticated (any unexpected result halts before sign-in)
  await expectStatus('U1', 'GET /admin/users without a session', 401, () => call('GET', '/admin/users', { auth: false }));
  await expectStatus('U2', `GET ${CM}/${BLOG} without a session`, 401, () => call('GET', `${CM}/${BLOG}`, { auth: false }));
  await expectStatus('U3', `POST ${CM}/${BLOG} without a session (relation to a non-existent document)`, 401,
    () => call('POST', `${CM}/${BLOG}`, { auth: false, body: FAKE_CONNECT }));
  await expectStatus('U4', 'GET /admin/users with a fake bearer token', 401, () => call('GET', '/admin/users', { token: 'g5-fake-token' }));
  if (halted) throw new Error(`Unauthenticated checks failed: ${halted}`);

  // 2. Sign in and confirm identity and role against the read-only preflight
  let password = await askHidden(`Password for ${TEST_EMAIL} (hidden): `);
  const login = await call('POST', '/admin/login', { auth: false, body: { email: TEST_EMAIL, password, deviceId, rememberMe: false } });
  password = null;
  if (login.status !== 200 || !login.json?.data?.token) throw new Error(`Login failed with status ${login.status}`);
  session = login.json.data.token;
  record('L1', 'POST /admin/login (test account, own device id)', 200, login.status);
  const me = await call('GET', '/admin/users/me');
  const roles = me.json?.data?.roles ?? [];
  record('L2', `GET /admin/users/me - roles ${JSON.stringify(roles.map((r) => r.name))}`, 200, me.status);
  if (roles.length !== 1 || roles[0].name !== EXPECTED_ROLE || roles[0].id !== pre.roleId) throw new Error(`Unexpected roles ${JSON.stringify(roles.map((r) => r.name))}`);
  const myId = me.json.data.id;
  if (myId !== pre.userId) throw new Error('Signed-in user does not match the preflight user');

  // A20 (read only, before any write): the role holds no escalation-relevant permission.
  {
    const r = await call('GET', '/admin/users/me/permissions');
    const perms = Array.isArray(r.json?.data) ? r.json.data : null;
    const bad = perms ? perms.filter(isForbiddenPermission).map((p) => `${p.action}${p.subject ? ' on ' + p.subject : ''}`) : null;
    checkOrHalt('A20', 'GET /admin/users/me/permissions: no user/role/token/webhook/project-settings/schema/users-permissions/email/'
      + 'upload-settings management, no view/layout configuration, no review-workflow/release/provider-login/audit-log/marketplace/debug-dump action, '
      + 'no locale write, no media update/delete, no Blog/News delete, no Newsletter access, no Region/Author/Category write',
      true, r.status === 200 && bad !== null && bad.length === 0,
      { note: `HTTP ${r.status}; ${bad === null ? 'response unreadable' : `${perms.length} permissions, ${bad.length} forbidden${bad.length ? ': ' + bad.join(', ') : ''}`}` });
  }

  // 3. Allowed reads
  const regions = await expectStatus('R1', `GET ${CM}/${REGION} (read Regions)`, 200, () => call('GET', `${CM}/${REGION}?pageSize=10`));
  const ph = regions?.json?.results?.find((r) => r.slug === 'region3') ?? regions?.json?.results?.[0];
  if (!halted && !ph?.documentId) halted = 'R1 returned no Region';
  regionDocId = ph?.documentId ?? null;
  await expectStatus('R2', `GET ${CM}/${BLOG} (read Blogs)`, 200, () => call('GET', `${CM}/${BLOG}?pageSize=1`));
  await expectStatus('R3', `GET ${CM}/${NEWS} (read News)`, 200, () => call('GET', `${CM}/${NEWS}?pageSize=1`));

  // 4. Upload one test image (unique name; Strapi also stores it under a generated hash) and record a baseline
  const form = new FormData();
  form.append('files', new Blob([PNG_1PX], { type: 'image/png' }), `g5-test-pixel-${stamp}.png`);
  form.append('fileInfo', JSON.stringify({ name: NAMES.file, alternativeText: 'G5 TEST image', caption: 'G5 TEST' }));
  const up = await expectStatus('M1', 'POST /upload (one new 1x1 G5 TEST image, no id = never a replacement)', [200, 201], () => call('POST', '/upload', { form }));
  const file = Array.isArray(up?.json) ? up.json[0] : up?.json?.data?.[0];
  if (!halted && !file?.id) halted = 'M1 returned no file id';
  created.fileId = file?.id;
  const fileFingerprint = (f) => JSON.stringify([f?.name, f?.alternativeText, f?.caption, f?.hash, f?.ext, f?.mime, f?.size, f?.url, f?.updatedAt]);
  let fileBaseline = null; let diskBaseline = null;
  if (!halted) {
    fileBaseline = fileFingerprint((await call('GET', `/upload/files/${created.fileId}`)).json);
    const diskPath = `${CMS_DIR}/public${file.url}`;
    diskBaseline = existsSync(diskPath) ? statSync(diskPath).size : -1;
    created.fileUrl = file.url;
  }
  verifyTestImage = async () => {
    const r = await call('GET', `/upload/files/${created.fileId}`);
    const same = r.status === 200 && fileFingerprint(r.json) === fileBaseline;
    const diskPath = `${CMS_DIR}/public${created.fileUrl}`;
    const disk = existsSync(diskPath) ? statSync(diskPath).size : -1;
    const ok = same && disk === diskBaseline && disk > 0;
    return { ok, note: `test image record+metadata unchanged: ${same}; stored file present and same size: ${disk === diskBaseline && disk > 0}` };
  };

  // 5. Blog: create draft -> confirm it is in the expected SQLite file -> draft privacy -> update -> publish/unpublish window
  const blogSlug = `g5-test-blog-${stamp}`;
  slugs.blog = blogSlug;
  const blog = await expectStatus('B1', `POST ${CM}/${BLOG} (create G5 TEST Blog draft)`, [200, 201], () => call('POST', `${CM}/${BLOG}`, { body: {
    title: NAMES.blog, slug: blogSlug, excerpt: 'G5 TEST excerpt. Local authorization test entry.',
    content: blocks('G5 TEST body. Local authorization test entry; safe to delete.'), featuredImage: created.fileId,
    regions: { connect: [{ documentId: regionDocId }] }, publicationDate: new Date().toISOString(),
    seo: { metaTitle: NAMES.blogSeo, metaDescription: 'G5 TEST meta description.' } } }));
  created.blogDocumentId = blog?.json?.data?.documentId;
  if (!halted && !created.blogDocumentId) halted = 'B1 returned no documentId';
  if (!halted) checkOrHalt('V1', 'The new draft exists in velza-cms/.tmp/manual-test.db (active database identified)', true, dbHasDocument('blogs', created.blogDocumentId));
  if (!halted) {
    const p = await publicCount('blogs', blogSlug);
    checkOrHalt('P1', 'Public /api/blogs?status=draft does not return the draft', 0, p.count, { note: `HTTP ${p.status}` });
  }
  await expectStatus('B2', 'PUT update the G5 TEST Blog draft', 200, () => call('PUT', `${CM}/${BLOG}/${created.blogDocumentId}`, { body: { excerpt: 'G5 TEST excerpt (updated).' } }));
  await publishWindow('B', BLOG, created.blogDocumentId, 'G5 TEST Blog');
  if (!halted) {
    const p = await publicCount('blogs', blogSlug);
    checkOrHalt('P2', 'Public API does not return the Blog after unpublish', 0, p.count, { note: `HTTP ${p.status}` });
  }

  // 6. News: same
  const newsSlug = `g5-test-news-${stamp}`;
  slugs.news = newsSlug;
  const news = await expectStatus('N1', `POST ${CM}/${NEWS} (create G5 TEST News draft)`, [200, 201], () => call('POST', `${CM}/${NEWS}`, { body: {
    title: NAMES.news, slug: newsSlug, summary: 'G5 TEST summary. Local authorization test entry.',
    content: blocks('G5 TEST news body. Local authorization test entry; safe to delete.'), featuredImage: created.fileId,
    regions: { connect: [{ documentId: regionDocId }] }, publicationDate: new Date().toISOString(),
    seo: { metaTitle: NAMES.newsSeo, metaDescription: 'G5 TEST meta description.' } } }));
  created.newsDocumentId = news?.json?.data?.documentId;
  if (!halted && !created.newsDocumentId) halted = 'N1 returned no documentId';
  if (!halted) {
    const p = await publicCount('news-articles', newsSlug);
    checkOrHalt('P3', 'Public /api/news-articles?status=draft does not return the draft', 0, p.count, { note: `HTTP ${p.status}` });
  }
  await expectStatus('N2', 'PUT update the G5 TEST News draft', 200, () => call('PUT', `${CM}/${NEWS}/${created.newsDocumentId}`, { body: { summary: 'G5 TEST summary (updated).' } }));
  await publishWindow('N', NEWS, created.newsDocumentId, 'G5 TEST News');
  if (!halted) {
    const p = await publicCount('news-articles', newsSlug);
    checkOrHalt('P4', 'Public API does not return the News after unpublish', 0, p.count, { note: `HTTP ${p.status}` });
  }

  // 7. Forbidden deletes. The route policy checks explorer.delete before any lookup, so a non-existent id tests the
  // permission without anything to delete; the run's own test entries are re-read afterwards.
  const stillThere = (model, id) => async () => {
    const r = await call('GET', `${CM}/${model}/${id}`);
    return { ok: r.status === 200, note: `test record still present: ${r.status === 200}` };
  };
  await expectDenied('D1', 'DELETE a Blog (non-existent id)', () => call('DELETE', `${CM}/${BLOG}/${FAKE_DOC_ID}`), stillThere(BLOG, created.blogDocumentId));
  await expectDenied('D2', 'POST Blog bulkDelete [non-existent id]', () => call('POST', `${CM}/${BLOG}/actions/bulkDelete`, { body: { documentIds: [FAKE_DOC_ID] } }), stillThere(BLOG, created.blogDocumentId));
  await expectDenied('D3', 'DELETE a News article (non-existent id)', () => call('DELETE', `${CM}/${NEWS}/${FAKE_DOC_ID}`), stillThere(NEWS, created.newsDocumentId));
  await expectDenied('D4', 'POST News bulkDelete [non-existent id]', () => call('POST', `${CM}/${NEWS}/actions/bulkDelete`, { body: { documentIds: [FAKE_DOC_ID] } }), stillThere(NEWS, created.newsDocumentId));

  // 8. Regions read-only (empty body fails required-field validation; non-existent id)
  await expectDenied('G1', `POST ${CM}/${REGION} (create, empty body)`, () => call('POST', `${CM}/${REGION}`, { body: {} }));
  await expectDenied('G2', `PUT ${CM}/${REGION}/<non-existent id> (empty body)`, () => call('PUT', `${CM}/${REGION}/${FAKE_DOC_ID}`, { body: {} }));
  await expectDenied('G3', `DELETE ${CM}/${REGION}/<non-existent id>`, () => call('DELETE', `${CM}/${REGION}/${FAKE_DOC_ID}`));

  // 9. Newsletter (draft & publish skips required fields, so the create carries a relation that cannot resolve)
  await expectDenied('W1', `GET ${CM}/${NEWSLETTER}`, () => call('GET', `${CM}/${NEWSLETTER}`));
  await expectDenied('W2', `POST ${CM}/${NEWSLETTER} (relation to a non-existent document)`, () => call('POST', `${CM}/${NEWSLETTER}`, { body: FAKE_CONNECT }));

  // 10. Media: no request below can perform a valid edit, replacement or deletion of any other file.
  //  M2: edit details of the TEST image with its current values (no-op).        handler: lookup, then permission
  //  M3: POST /upload?id= with NO file: Strapi treats it as a metadata update of the TEST image only.
  //  M4: DELETE a non-existent file id (deletes nothing).        route policy plugin::upload.assets.update, checked first
  //  M5: bulk-delete with empty lists (deletes nothing).          route policy plugin::upload.assets.update, checked first
  await expectDenied('M2', 'PUT /upload/files/:id on the TEST image (no-op values)', () => call('PUT', `/upload/files/${created.fileId}`,
    { body: { fileInfo: { name: NAMES.file, alternativeText: 'G5 TEST image', caption: 'G5 TEST' } } }), verifyTestImage);
  const replaceForm = new FormData();
  replaceForm.append('fileInfo', JSON.stringify({ alternativeText: 'G5 TEST image' }));
  await expectDenied('M3', 'POST /upload?id=:id on the TEST image (no file attached)', () => call('POST', `/upload?id=${created.fileId}`, { form: replaceForm }), verifyTestImage);
  await expectDenied('M4', 'DELETE /upload/files/<non-existent id>', () => call('DELETE', `/upload/files/${FAKE_FILE_ID}`), verifyTestImage);
  await expectDenied('M5', 'POST /upload/actions/bulk-delete (empty lists)', () => call('POST', '/upload/actions/bulk-delete', { body: { fileIds: [], folderIds: [] } }), verifyTestImage);

  // 11. Administration (empty bodies, each rejected by its validator even if permission were granted)
  for (const [id, path] of [['A1', '/admin/users'], ['A2', '/admin/roles'], ['A3', '/admin/api-tokens'], ['A4', '/admin/admin-tokens'],
    ['A5', '/admin/transfer/tokens'], ['A6', '/admin/webhooks'], ['A7', '/admin/project-settings'], ['A8', '/content-type-builder/content-types'],
    ['A9', '/users-permissions/roles'], ['A10', '/email/settings']]) {
    await expectDenied(id, `GET ${path}`, () => call('GET', path));
  }
  for (const [id, method, path] of [['A11', 'POST', '/admin/users'], ['A12', 'POST', '/admin/roles'],
    ['A14', 'POST', '/admin/api-tokens'], ['A15', 'POST', '/admin/webhooks'], ['A16', 'POST', '/content-type-builder/content-types'],
    ['A17', 'POST', '/users-permissions/roles'], ['A18', 'POST', '/i18n/locales'], ['A19', 'PUT', '/upload/settings']]) {
    await expectDenied(id, `${method} ${path} (empty body)`, () => call(method, path, { body: {} }));
  }
  await expectDenied('A13', `GET /admin/roles/<"${EXPECTED_ROLE}" id, resolved by name>/permissions`, () => call('GET', `/admin/roles/${pre.roleId}/permissions`));

  // 12. Informational reads
  await expectInfo('I1', 'GET /admin/information', 200, 'route requires only a signed-in admin', () => call('GET', '/admin/information'));
  await expectInfo('I2', 'GET /i18n/locales', 200, 'route requires only a signed-in admin', () => call('GET', '/i18n/locales'));
  await expectInfo('I3', 'GET /upload/settings (Media Library settings, read)', 200, 'route requires plugin::upload.read (Media Library access)',
    () => call('GET', '/upload/settings'));

} catch (err) {
  // A network error or timeout mid-test lands here: halt (no further test writes) and continue with finalization.
  halted = halted || describeError(err);
  console.error(`\nSTOPPED: ${describeError(err)}`);
} finally {
  // F. Publication cleanup: only this run's own Blog/News documents, only unpublish, only if actually published.
  const ownDocuments = new Set([created.blogDocumentId, created.newsDocumentId].filter(Boolean));
  // Each document is handled in its own step; an exception counts as a cleanup failure. The unpublish is never retried.
  let f = 0;
  for (const key of [...published]) {
    const [model, documentId] = key.split('|');
    const id = `F${++f}`;
    await finalStep(id, `Safety cleanup of ${model} ${documentId}`, async () => {
      if (![BLOG, NEWS].includes(model) || !ownDocuments.has(documentId)) {
        cleanupFailures.push(key);
        record(id, `Safety unpublish refused: ${documentId} is not one of this run's documents`, true, false);
        return;
      }
      if (!session) {
        cleanupFailures.push(key);
        record(id, `Safety unpublish of ${model} ${documentId} impossible without a session - check and unpublish manually`, true, false);
        return;
      }
      const cur = await call('GET', `${CM}/${model}/${documentId}`);
      if (cur.status !== 200) {
        cleanupFailures.push(key);
        record(id, `Safety check of ${model} ${documentId}: could not read publication state`, 200, cur.status);
        return;
      }
      const state = isPublished(cur);
      if (state === null) {
        cleanupFailures.push(key);
        record(id, `Safety check of ${model} ${documentId}: response carried no document, publication state unknown`, true, false);
        return;
      }
      if (!state) { published.delete(key); record(id, `Safety check: ${model} ${documentId} is not published (no action)`, true, true); return; }
      const r = await call('POST', `${CM}/${model}/${documentId}/actions/unpublish`, { body: {}, safety: true });
      if (r.status === 200) published.delete(key); else cleanupFailures.push(key);
      record(id, `Safety unpublish of ${model} ${documentId}`, 200, r.status);
    }, () => cleanupFailures.push(key));
  }

  // V. Final resource verification (authenticated reads with the still-valid session, plus public reads).
  if (session) {
    if (verifyTestImage && created.fileId) {
      await finalStep('V2', 'Final check: test image', async () => {
        const v = await verifyTestImage();
        record('V2', 'Final check: test image record, metadata and stored file unchanged', true, v.ok, { note: v.note });
      });
    }
    for (const [id, model, documentId, label] of [['V3', BLOG, created.blogDocumentId, 'Blog'], ['V4', NEWS, created.newsDocumentId, 'News']]) {
      if (!documentId) continue;
      await finalStep(id, `Final check: G5 TEST ${label}`, async () => {
        const r = await call('GET', `${CM}/${model}/${documentId}`);
        record(id, `Final check: G5 TEST ${label} still exists and is unpublished`, true, r.status === 200 && isPublished(r) === false, { note: `HTTP ${r.status}` });
      });
    }
  }
  for (const [id, type, slug, label] of [['V5', 'blogs', slugs.blog, 'Blog'], ['V6', 'news-articles', slugs.news, 'News']]) {
    if (!slug) continue;
    await finalStep(id, `Final check: public API for G5 TEST ${label}`, async () => {
      const p = await publicCount(type, slug);
      record(id, `Final check: public API returns no G5 TEST ${label}`, 0, p.count, { note: `HTTP ${p.status}` });
    });
  }

  // H. Health
  if (before) await finalStep('H1', 'GET /_health', async () => record('H1', 'GET /_health', 204, (await call('GET', '/_health', { auth: false })).status));

  // S. Session isolation - the very last network steps. Nothing after this makes a network request. Both are always
  // attempted when a session exists; a failed logout is recorded and the replay still runs.
  if (session) {
    const oldToken = session;
    session = null; // no request below may use the session
    await finalStep('S1', "POST /admin/logout (this script's device only)", async () => record('S1', "POST /admin/logout (this script's device only)", 200,
      (await call('POST', '/admin/logout', { token: oldToken, body: { deviceId }, safety: true })).status));
    await finalStep('S2', 'Replay with the logged-out token', async () => record('S2', `Replay GET ${CM}/${BLOG} with the logged-out token`, 401,
      (await call('GET', `${CM}/${BLOG}?pageSize=1`, { token: oldToken })).status));
  }

  // D. Read-only, fail-closed database comparison (local file read only; runs after logout so sessions are final).
  let database = null;
  if (before) {
    try {
      database = compareDatabase(before, { blogDocId: created.blogDocumentId, newsDocId: created.newsDocumentId, fileId: created.fileId,
        myId: pre.userId, deviceId, regionDocId, blogTitle: NAMES.blog, newsTitle: NAMES.news, fileName: NAMES.file,
        seoTitles: new Set([NAMES.blogSeo, NAMES.newsSeo]) });
      const count = (kinds) => database.problems.filter((p) => kinds.includes(p.kind)).length;
      record('DB1', `Database: no pre-existing row modified or deleted (${database.tablesCovered} tables, all rows)`, 0, count(['modified', 'deleted', 'changed', 'table removed']));
      record('DB2', 'Database: every added row attributable to this run (protected tables: none allowed)', 0, count(['added', 'table added']));
      record('DB3', 'Database: exact expected end state (per document: 1 draft, 1 SEO component + link, 1 region link, 1 image link; 1 file)', 0, database.missingExpected.length,
        { note: database.missingExpected.join('; ') || undefined });
      for (const p of database.problems.slice(0, 50)) console.log(`  DB ${p.kind.padEnd(13)} ${p.table}${p.id !== undefined ? ` id=${p.id}` : ''}${p.reason ? ` (${p.reason})` : ''}`);
      if (database.problems.length > 50) console.log(`  ... ${database.problems.length - 50} more in the results file`);
    } catch (err) {
      finalizationErrors.push(`DB0: ${err.message}`);
      record('DB0', 'Database comparison completed', true, false, { note: err.message });
    }
  } else {
    record('DB0', 'Database before-snapshot taken', true, false, { note: 'preflight or snapshot failed; no request was made' });
  }

  const unexpected = results.filter((r) => r.result !== 'PASS');
  let verdict = !halted && unexpected.length === 0 && cleanupFailures.length === 0 && published.size === 0 && finalizationErrors.length === 0 && uncertainWrites.length === 0
    ? 'PASS' : 'FAIL';
  process.exitCode = verdict === 'PASS' ? 0 : 1;
  const summary = { ranAt: new Date().toISOString(), base: BASE, account: TEST_EMAIL, verdict, halted, created, publicationTimeline: timeline,
    stillPublished: [...published], cleanupFailures, finalizationErrors, uncertainWrites, database, results };
  let resultsWritten = false;
  try {
    writeFileSync(RESULTS_FILE, JSON.stringify(summary, null, 2));
    resultsWritten = true;
  } catch (err) {
    // A run without a saved record cannot pass.
    verdict = 'FAIL';
    process.exitCode = 1;
    console.error(`RESULTS FILE NOT WRITTEN (${RESULTS_FILE}): ${err.message}`);
  }
  for (const t of timeline) console.log(`Published window: ${t.document} ${t.publishRequestAt} -> ${t.unpublishedConfirmedAt} (${t.publicWindowMs} ms)`);
  console.log(`\n${results.length} checks, ${results.length - unexpected.length} as expected, ${unexpected.length} unexpected${halted ? `; halted: ${halted}` : ''}.`);
  if (finalizationErrors.length) console.log(`FINALIZATION INCOMPLETE: ${finalizationErrors.join('; ')}`);
  if (uncertainWrites.length) console.log(`MANUAL CHECK REQUIRED - these writes failed at network level and may still have completed on the server: ${uncertainWrites.join('; ')}`);
  if (cleanupFailures.length || published.size) console.log(`CLEANUP FAILED - may still be published: ${JSON.stringify([...new Set([...cleanupFailures, ...published])])}`);
  console.log(`VERDICT: ${verdict}`);
  console.log(`Test records left for separate cleanup: ${JSON.stringify(created)}`);
  if (resultsWritten) console.log(`Results (no secrets, no row contents) saved to ${RESULTS_FILE}`);
}
