function toSafeInt(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isSafeInteger(n)) return n;
  }
  return null;
}

function clampLimit(limit, def = 20, max = 100) {
  const n = toSafeInt(limit);
  if (n == null) return def;
  return Math.max(1, Math.min(max, n));
}

function normalizeQuery(q) {
  if (q == null) return '';
  const s = String(q).trim();
  return s.slice(0, 32);
}

function startsWithId(id, q) {
  if (!q) return true;
  return String(id).startsWith(q);
}

function binarySearchFirstGreater(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

module.exports = {
  toSafeInt,
  clampLimit,
  normalizeQuery,
  startsWithId,
  binarySearchFirstGreater
};
