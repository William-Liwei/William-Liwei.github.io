const clean = (value) => String(value || '').trim().toLowerCase();
export const FAVORITES_KEY = 'ccfonline-favorites-v1';
export const PREFERENCES_KEY = 'ccfonline-preferences-v1';

export function favoriteKey(row, tab) {
  if (tab === 'conf' || (tab === 'ccf' && row.type === '会议')) {
    return 'conference:' + clean(row.dblp || row.title || row.name || row.full);
  }
  return 'journal:' + clean(row.issn || row.eissn || row.full || row.name).replace(/\s/g, '');
}
export function readStored(storage, key, fallback) {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeStored(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function favoriteSet(value) {
  return new Set(Array.isArray(value) ? value.filter((key) => typeof key === 'string' && /^(conference|journal):.+/.test(key)).slice(0, 10000) : []);
}
