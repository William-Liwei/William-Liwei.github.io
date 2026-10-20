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

export const FAVORITES_BACKUP_MAX_BYTES = 100 * 1024;
const FAVORITES_BACKUP_MAX_COUNT = 10000;
const backupSize = (text) => new TextEncoder().encode(text).byteLength;

function validateBackupKeys(keys) {
  if (!Array.isArray(keys) || keys.length > FAVORITES_BACKUP_MAX_COUNT || keys.some((key) =>
    typeof key !== 'string' || key.length > 512 || !/^(conference|journal):[^\u0000-\u001f\u007f]+$/u.test(key)
    || !key.slice(key.indexOf(':') + 1).trim())) {
    throw new Error('收藏备份内容无效，请选择由本站导出的 JSON 文件');
  }
  return new Set(keys);
}

export function serializeFavoritesBackup(favorites) {
  const keys = validateBackupKeys([...favorites]);
  const text = JSON.stringify({ source: 'ccf-online', version: 1, favorites: [...keys] });
  if (backupSize(text) > FAVORITES_BACKUP_MAX_BYTES) throw new Error('收藏备份超过 100 KB，暂时无法导出');
  return text;
}

export function parseFavoritesBackup(text) {
  if (typeof text !== 'string' || backupSize(text) > FAVORITES_BACKUP_MAX_BYTES) {
    throw new Error('请选择不超过 100 KB 的收藏备份');
  }
  let backup;
  try { backup = JSON.parse(text); } catch { throw new Error('无法读取收藏备份，请选择由本站导出的 JSON 文件'); }
  if (!backup || Array.isArray(backup) || typeof backup !== 'object'
    || Object.keys(backup).length !== 3
    || !Object.hasOwn(backup, 'source') || backup.source !== 'ccf-online'
    || !Object.hasOwn(backup, 'version') || backup.version !== 1
    || !Object.hasOwn(backup, 'favorites')) {
    throw new Error('收藏备份格式不匹配，请选择由本站导出的 JSON 文件');
  }
  return validateBackupKeys(backup.favorites);
}

export function mergeFavoritesBackup(existing, text) {
  const incoming = parseFavoritesBackup(text);
  const favorites = validateBackupKeys([...existing]);
  const previous = favorites.size;
  for (const key of incoming) favorites.add(key);
  if (favorites.size > FAVORITES_BACKUP_MAX_COUNT) throw new Error('合并后的收藏超过数量上限，原收藏已保留');
  return { favorites, added: favorites.size - previous };
}

export function importFavoritesBackup(storage, existing, text) {
  const merged = mergeFavoritesBackup(existing, text);
  return { ...merged, persisted: writeStored(storage, FAVORITES_KEY, [...merged.favorites]) };
}
