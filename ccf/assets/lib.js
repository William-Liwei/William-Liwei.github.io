// Pure helpers shared by the browser app (assets/app.js) and the Node build
// script (scripts/build-data.mjs). No DOM access here so it can be unit tested.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// ---------- Time zones ----------

// Abbreviations seen in ccfddl data (plus common ones) that follow DST.
const NAMED_ZONES = {
  PT: 'America/Los_Angeles', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
  ET: 'America/New_York', EST: 'America/New_York', EDT: 'America/New_York',
  CET: 'Europe/Paris', CEST: 'Europe/Paris', BST: 'Europe/London',
  JST: 'Asia/Tokyo', KST: 'Asia/Seoul'
};

// Returns { offset } (fixed hours from UTC) or { zone } (IANA name).
// Unknown or missing values fall back to AoE, the ccfddl default.
export function parseTimezone(tz) {
  const s = String(tz ?? '').trim();
  if (!s || /^aoe$/i.test(s)) return { offset: -12 };
  if (/^(utc|gmt|z)$/i.test(s)) return { offset: 0 };
  const m = s.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (m) return { offset: (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] || 0) / 60) };
  const named = NAMED_ZONES[s.toUpperCase()];
  if (named) return { zone: named };
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s });
    return { zone: s };
  } catch {
    return { offset: -12 };
  }
}

const dtfCache = new Map();
function zoneFormatter(zone) {
  if (!dtfCache.has(zone)) {
    dtfCache.set(zone, new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  }
  return dtfCache.get(zone);
}

// Offset of an IANA zone from UTC at a given instant, in milliseconds.
export function zoneOffset(zone, utcMs) {
  const parts = {};
  for (const p of zoneFormatter(zone).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// "2026-09-30 23:59:59" + "AoE" -> UTC milliseconds. Date-only values mean end of day.
export function wallTimeToUtc(str, tz) {
  const m = String(str ?? '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] == null ? 23 : +m[4], m[5] == null ? 59 : +m[5], m[6] == null ? 59 : +m[6]);
  const t = parseTimezone(tz);
  if (t.zone == null) return wall - t.offset * HOUR;
  // Two passes so wall times right after a DST switch resolve correctly.
  const guess = wall - zoneOffset(t.zone, wall);
  return wall - zoneOffset(t.zone, guess);
}

const fmtCache = new Map();
function formatter(locale, options) {
  const key = locale + JSON.stringify(options);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat(locale, options));
  return fmtCache.get(key);
}

// UTC ms -> "2026-09-30 23:59" in a zone from parseTimezone(); null means the
// browser's own zone. withWeekday appends e.g. " 周三".
export function formatInZone(ms, spec, withWeekday = false) {
  if (ms == null) return '';
  let date = new Date(ms);
  let timeZone;
  if (spec?.zone) {
    timeZone = spec.zone;
  } else if (typeof spec?.offset === 'number') {
    date = new Date(ms + spec.offset * HOUR);
    timeZone = 'UTC';
  }
  const parts = {};
  const options = { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
  for (const p of formatter('en-US', options).formatToParts(date)) parts[p.type] = p.value;
  const text = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  return withWeekday ? `${text} ${formatter('zh-CN', { timeZone, weekday: 'short' }).format(date)}` : text;
}

// ---------- Deadlines ----------

export function deadlineStatus(ms, now = Date.now()) {
  if (ms == null) return 'unknown';
  const diff = ms - now;
  if (diff < 0) return 'passed';
  if (diff <= 7 * DAY) return 'urgent';
  if (diff <= 30 * DAY) return 'warning';
  return 'normal';
}

// Picks the next upcoming deadline of a conference edition; if every round has
// passed, the latest one. Returns null when no round has a parsable date.
export function pickDeadline(timeline, now = Date.now()) {
  const rounds = (timeline || []).filter((r) => r.deadline != null);
  if (!rounds.length) return null;
  const upcoming = rounds.filter((r) => r.deadline >= now).sort((a, b) => a.deadline - b.deadline);
  const round = upcoming[0] || rounds.reduce((a, b) => (b.deadline > a.deadline ? b : a));
  return { ...round, rounds: rounds.length, status: deadlineStatus(round.deadline, now) };
}

export function formatCountdown(ms, now = Date.now()) {
  if (ms == null) return '';
  const diff = ms - now;
  if (diff < 0) return '已截稿';
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  if (days > 0) return `还剩 ${days} 天 ${hours} 小时`;
  const minutes = Math.max(1, Math.floor((diff % HOUR) / 60000));
  return hours > 0 ? `还剩 ${hours} 小时 ${minutes} 分` : `还剩 ${minutes} 分钟`;
}

// ---------- Conference data (ccfddl allconf.yml / allacc.yml) ----------

function buildAcceptanceIndex(accList) {
  return createConferenceIndex((accList || []).filter((item) => item?.title && Array.isArray(item.accept_rates)));
}

// Flattens ccfddl YAML (already parsed) into one row per conference edition.
export function processConferences(confList, accList) {
  const acc = buildAcceptanceIndex(accList);
  const conferences = createConferenceIndex(confList || []);
  const rows = [];
  for (const conf of confList || []) {
    if (!conf?.title || !Array.isArray(conf.confs)) continue;
    let matches = findConferenceRows(acc, conf);
    // Older acceptance files may only identify an abbreviation. Do not assign
    // that rate to either venue when the conference source has a name collision.
    const ambiguous = (conferences.byName.get(nameKey(conf.title))?.size || 0) > 1;
    if (ambiguous && matches && !matches.every((item) =>
      (conferenceDblp(conf) && conferenceDblp(item) === conferenceDblp(conf)) ||
      (conferenceSource(conf) && conferenceSource(item) === conferenceSource(conf)))) matches = null;
    const rates = (matches || []).flatMap((item) => item.accept_rates)
      .filter((r) => r?.year != null && typeof r.rate === 'number' && Number.isFinite(r.rate))
      .map((r) => ({ year: Number(r.year), rate: r.rate, str: r.str || '' }))
      .sort((a, b) => b.year - a.year);
    for (const c of conf.confs) {
      const timeline = (c.timeline || []).map((t) => {
        const round = { deadline: wallTimeToUtc(t.deadline, c.timezone) };
        const abstract = wallTimeToUtc(t.abstract_deadline, c.timezone);
        if (abstract != null) round.abstract = abstract;
        if (t.comment) round.comment = String(t.comment);
        return round;
      });
      const rate = rates.find((r) => r.year === Number(c.year)) || rates[0] || null;
      rows.push({
        title: String(conf.title),
        dblp: String(conf.dblp || '').toLowerCase(),
        sourceKey: conferenceSource(conf),
        description: conf.description || '',
        sub: conf.sub || '',
        rank: conf.rank?.ccf || 'N',
        year: Number(c.year) || null,
        link: c.link || '',
        date: c.date || '',
        place: c.place || '',
        timezone: c.timezone || 'AoE',
        timeline,
        acceptance: rate
      });
    }
  }
  return rows;
}

// ---------- CCF recommended list (Markdown tables) ----------

export function parseCcfList(markdown) {
  const rows = [];
  let category = '';
  let type = '';
  let level = '';
  for (const rawLine of String(markdown).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('######')) {
      const m = line.match(/([ABC])\s*类/);
      if (m) level = m[1];
      continue;
    }
    if (line.startsWith('#####')) {
      const m = line.match(/[（(]([^）)]+)[）)]/);
      if (m) category = m[1].replace(/／/g, '/').replace(/\s+/g, '');
      type = line.includes('期刊') ? '期刊' : line.includes('会议') ? '会议' : type;
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 4 || !/^\d+$/.test(cells[0])) continue;
    const row = {
      name: cells[1] || '',
      full: cells[2] || '',
      category, type, level,
      publisher: cells[3] || '',
      url: cells[4] || ''
    };
    const dblp = dblpKey(row.url);
    if (dblp) row.dblp = dblp;
    rows.push(row);
  }
  return rows;
}

// DBLP key from a CCF list URL such as https://dblp.org/db/conf/kdd/index.html.
export function dblpKey(url) {
  return (String(url ?? '').match(/\/db\/(?:conf|journals)\/([^/]+)/i)?.[1] || '').toLowerCase();
}

// Keys used to link a CCF list conference with ccfddl rows (which use different
// names for some, e.g. "SIGKDD" vs "KDD").
export function conferenceKeys(name, dblp) {
  return [dblp && `d:${String(dblp).trim().toLowerCase()}`, nameKey(name) && `n:${nameKey(name)}`].filter(Boolean);
}

const conferenceDblp = row => String(row?.dblp || '').trim().toLowerCase();
const conferenceSource = row => String(row?.sourceKey || row?.conference_key || '').trim().toLowerCase();
const conferenceName = row => nameKey(row?.title || row?.name);

// Editions of one venue share an identity; equal abbreviations alone do not.
export function conferenceIdentity(row) {
  const dblp = conferenceDblp(row), source = conferenceSource(row);
  return dblp ? `d:${dblp}` : source ? `s:${source}`
    : `n:${conferenceName(row)}:${nameKey(row?.description || row?.full)}`;
}

export function createConferenceIndex(rows) {
  const byDblp = new Map(), bySource = new Map(), byName = new Map();
  const add = (map, key, row) => { if (key) { if (!map.has(key)) map.set(key, []); map.get(key).push(row); } };
  for (const row of rows || []) {
    if (!row) continue;
    add(byDblp, conferenceDblp(row), row);
    add(bySource, conferenceSource(row), row);
    const name = conferenceName(row);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, new Map());
    add(byName.get(name), conferenceIdentity(row), row);
  }
  return { byDblp, bySource, byName };
}

export function findConferenceRows(index, query) {
  if (!index) return null;
  const dblp = conferenceDblp(query), source = conferenceSource(query);
  if (dblp && index.byDblp.has(dblp)) return index.byDblp.get(dblp);
  const exactSource = source && index.bySource.get(source);
  if (exactSource && !exactSource.some((r) => dblp && conferenceDblp(r) && conferenceDblp(r) !== dblp)) return exactSource;
  const names = index.byName.get(conferenceName(query));
  if (names?.size !== 1) return null;
  const candidates = names.values().next().value;
  // A known, different identity is not a spelling variant of this venue.
  if (candidates.some((r) => (dblp && conferenceDblp(r) && conferenceDblp(r) !== dblp)
    || (source && conferenceSource(r) && conferenceSource(r) !== source))) return null;
  return candidates;
}

export function latestConferenceYears(rows) {
  const years = new Map();
  for (const row of rows || []) {
    const key = conferenceIdentity(row);
    years.set(key, Math.max(years.get(key) || 0, row.year || 0));
  }
  return years;
}

export function nextConferenceDeadline(index, query, now = Date.now()) {
  let next = null;
  for (const row of findConferenceRows(index, query) || []) {
    const d = pickDeadline(row.timeline, now);
    if (d && d.status !== 'passed' && (!next || d.deadline < next.deadline)) next = { ...d, year: row.year };
  }
  return next;
}

export function deadlineStage(round, now = Date.now()) {
  return Number.isFinite(round?.deadline) && round.deadline >= now && Number.isFinite(round.abstract) && round.abstract < now
    ? '摘要已截止 · 全文未截止' : '';
}

// Source round order is retained; dates that were not supplied stay unknown.
export function deadlineRoundsHTML(row, zone, now = Date.now()) {
  if (!Array.isArray(row.timeline) || !row.timeline.length) return '';
  const time = (value, missing) => Number.isFinite(value)
    ? `<time datetime="${new Date(value).toISOString()}">${esc(formatInZone(value, zone))}</time>` : missing;
  const items = row.timeline.map((round, i) => `<li><strong>第 ${i + 1} 轮</strong>`
    + `<span>摘要：${time(round.abstract, '未提供')}</span><span>全文：${time(round.deadline, '待公布')}</span>`
    + (deadlineStage(round, now) ? `<span class="deadline-stage">${deadlineStage(round, now)}</span>` : '')
    + (round.comment ? `<span class="round-comment">${esc(round.comment)}</span>` : '') + '</li>').join('');
  const key = JSON.stringify([conferenceIdentity(row), row.year]);
  return `<details class="deadline-rounds" data-rounds-key="${esc(key)}"><summary>查看各轮时间（${row.timeline.length}）</summary><ol>${items}</ol></details>`;
}

export function conferenceCopyText(row, now = Date.now()) {
  const beijing = { zone: 'Asia/Shanghai' }, d = pickDeadline(row.timeline, now);
  const lines = [`${row.title} ${row.year ?? ''}（CCF ${row.rank && row.rank !== 'N' ? row.rank : '未收录'}）`, row.description];
  lines.push(d ? `全文截稿：${formatInZone(d.deadline, beijing)} 北京时间（${formatInZone(d.deadline, parseTimezone(row.timezone))} ${row.timezone}）` : '全文截稿：待公布');
  if (Number.isFinite(d?.abstract)) lines.push(`摘要：${formatInZone(d.abstract, beijing)} 北京时间`);
  if (deadlineStage(d, now)) lines.push(`${deadlineStage(d, now)}；是否仍可投稿，请核对官网的摘要注册要求。`);
  if (row.timeline.length > 1 || !d) row.timeline.forEach((round, i) => {
    lines.push(`第 ${i + 1} 轮：摘要 ${round.abstract == null ? '未提供' : formatInZone(round.abstract, beijing)}；全文 ${round.deadline == null ? '待公布' : formatInZone(round.deadline, beijing)}（北京时间）${round.comment ? ` · ${round.comment}` : ''}`);
  });
  if (row.date || row.place) lines.push(`会议：${[row.date, row.place].filter(Boolean).join(' · ')}`);
  if (row.acceptance) lines.push(`录用率：${(row.acceptance.rate * 100).toFixed(1)}%（${row.acceptance.year}）`);
  if (safeUrl(row.link)) lines.push(row.link);
  return lines.filter(Boolean).join('\n');
}

export function journalPartitionLines(journal, versions) {
  const lines = [];
  const jcr = [journal.jif && `IF ${journal.jif}`, journal.quartile && `最佳分区 ${journal.quartile}`,
    journal.rank && `最佳分区对应学科排名 ${journal.rank}`].filter(Boolean);
  if (jcr.length) lines.push(`JCR ${versions.jcrVersion}：${jcr.join('，')}`);
  if (journal.cas) lines.push(`中科院 ${versions.casVersion}：${journal.cas} 区${journal.casTop ? ' Top' : ''}`);
  if (journal.xr) lines.push(`新锐 ${versions.xrVersion}：${journal.xr} 区${journal.xrTop ? ' Top' : ''}${journal.xrWarn ? '（预警）' : ''}`);
  return lines;
}

// Normalize only writing differences, not venue meanings or synonyms.
export function searchTerms(query) {
  return String(query || '').normalize('NFKC').toLowerCase().replace(/[‐‑‒–—−]/g, '-').trim().split(/\s+/).filter(Boolean);
}

export function journalSearchText(journal) {
  const aliases = Array.isArray(journal.aliases) ? journal.aliases : [];
  const compact = [journal.issn, journal.eissn].map(s => String(s || '').replace(/[-\s]/g, ''));
  return searchTerms([journal.name, ...aliases, journal.issn, journal.eissn, ...compact].join(' ')).join(' ');
}

// ---------- Journal name matching ----------

// Strict key: case, accents, "&" vs "and" and punctuation are ignored
// (NFKD splits accents into combining marks, which the last replace drops).
export function nameKey(name) {
  return String(name ?? '').toLowerCase().normalize('NFKD')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '');
}

// Loose key: also drops function words, so "Transactions in/on X" or
// "Systems, Man, and Cybernetics" variants line up.
export function looseKey(name) {
  return String(name ?? '').toLowerCase().normalize('NFKD')
    .replace(/&/g, ' ').replace(/\b(the|and|of|on|in|for|an|a)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
}

// Index for looking up journals by name. JCR often appends a suffix after "-"
// (e.g. "COMPUTERS & GRAPHICS-UK"), so the part before it is indexed too.
export function createJournalIndex(names) {
  const strict = new Map();
  const loose = new Map();
  const add = (map, key, i) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, i);
    else if (map.get(key) !== i) map.set(key, -1); // ambiguous
  };
  names.forEach((name, i) => {
    add(strict, nameKey(name), i);
    add(loose, looseKey(name), i);
  });
  names.forEach((name, i) => {
    const prefix = String(name).split(/\s*-\s*(?=[A-Za-z])/)[0];
    if (prefix !== name && prefix.split(/\s+/).length >= 2) {
      const k = nameKey(prefix);
      if (!strict.has(k)) strict.set(k, i);
      const lk = looseKey(prefix);
      if (!loose.has(lk)) loose.set(lk, i);
    }
  });
  return { strict, loose };
}

export function findJournal(index, name) {
  const candidates = [name];
  const beforeColon = String(name).split(':')[0];
  if (beforeColon !== name) candidates.push(beforeColon);
  for (const c of candidates) {
    for (const [map, key] of [[index.strict, nameKey(c)], [index.loose, looseKey(c)]]) {
      const i = map.get(key);
      if (i != null && i >= 0) return i;
    }
  }
  return -1;
}

// ---------- CSV ----------

// RFC 4180 CSV (quoted fields, "" escapes, embedded newlines) -> array of
// objects keyed by the header row. A leading BOM is ignored.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

// ---------- Output helpers ----------

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Only http(s) links from third-party data are rendered.
export function safeUrl(value) {
  const s = String(value ?? '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}
