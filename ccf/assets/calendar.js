// Browser-only calendar export. RFC 5545: UTC instants, escaped TEXT values,
// CRLF content lines and folds that never split a UTF-8 code point.
const encoder = new TextEncoder();

function text(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function fold(line) {
  let output = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      output += '\r\n ';
      bytes = 1;
    }
    output += char;
    bytes += size;
  }
  return output;
}

function validInstant(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999;
}

function utc(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function officialUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function uidFor(row, round, kind) {
  // Encode identity without hashing or using the deadline, so a changed date
  // retains its UID. The original round index is retained before filtering.
  const identity = JSON.stringify([String(row.dblp || '').trim().toLowerCase(), String(row.title).trim().toLowerCase(), row.year ?? '', round, kind]);
  const encoded = Array.from(encoder.encode(identity), byte => byte.toString(16).padStart(2, '0')).join('');
  return `ccf-${encoded}@weili.space`;
}

/**
 * Export upcoming known deadline and abstract dates from conference records.
 * Input dates are already resolved UTC milliseconds; no missing date is guessed.
 * Calendar clients display those instants in their configured local time zone.
 */
export function buildConferenceCalendar(rows, { now = Date.now() } = {}) {
  if (!validInstant(now)) throw new RangeError('Invalid calendar export time');
  const events = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !String(row.title ?? '').trim() || !Array.isArray(row.timeline)) continue;
    row.timeline.forEach((round, index) => {
      if (!round || typeof round !== 'object') return;
      for (const kind of ['abstract', 'deadline']) {
        const deadline = round[kind];
        if (!validInstant(deadline) || deadline < now) continue;
        const uid = uidFor(row, index, kind);
        if (events.has(uid)) continue;
        const name = `${String(row.title).trim()}${row.year ? ` ${row.year}` : ''}`;
        const label = kind === 'abstract' ? '摘要截止' : '投稿截止';
        const roundLabel = row.timeline.length > 1 ? ` · 第 ${index + 1} 轮` : '';
        const link = officialUrl(row.link);
        const description = [
          `${name} · ${label}${roundLabel}`,
          row.description ? String(row.description) : '',
          round.comment ? String(round.comment) : '',
          row.timezone ? `来源时区：${row.timezone}；日历按你的本地时区显示。` : '',
          '这是导出时的截稿快照，会议延期不会自动同步。请以会议官网为准，并在日历中自行设置提醒。',
          link ? `会议官网：${link}` : '',
          '来自 CCF-Online：https://www.weili.space/ccf/',
        ].filter(Boolean).join('\n');
        const lines = [
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${utc(now)}`,
          `DTSTART:${utc(deadline)}`,
          `SUMMARY:${text(`${name} · ${label}${roundLabel}`)}`,
          `DESCRIPTION:${text(description)}`,
          'TRANSP:TRANSPARENT',
        ];
        if (row.place) lines.push(`LOCATION:${text(row.place)}`);
        if (link) lines.push(`URL:${link}`);
        lines.push('END:VEVENT');
        events.set(uid, { deadline, lines });
      }
    });
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CCF-Online//Conference Deadlines//ZH',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:CCF-Online 截稿日历',
    ...Array.from(events.values()).sort((a, b) => a.deadline - b.deadline).flatMap(event => event.lines),
    'END:VCALENDAR',
  ];
  return { text: lines.map(fold).join('\r\n') + '\r\n', count: events.size };
}
