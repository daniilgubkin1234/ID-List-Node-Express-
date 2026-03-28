const {
  toSafeInt,
  startsWithId,
  binarySearchFirstGreater
} = require('./utils');

const BASE_MIN = 1;
const BASE_MAX = 1_000_000;

const extras = new Set(); 
let extrasSorted = []; 

let selectedOrder = []; 
let selectedSet = new Set();

let revision = 1;

const pendingAddIds = new Set();

let seq = 0;
const pendingSelectAdd = new Map(); // id -> seq
const pendingSelectRemove = new Set();
const pendingReorders = new Map(); 
function bumpRevision() {
  revision += 1;
}

function existsId(id) {
  if (id >= BASE_MIN && id <= BASE_MAX) return true;
  if (extras.has(id)) return true;
  if (pendingAddIds.has(id)) return true;
  return false;
}

function isSelectedEffective(id) {
  if (pendingSelectRemove.has(id)) return false;
  if (pendingSelectAdd.has(id)) return true;
  return selectedSet.has(id);
}

function enqueueAdds(ids) {
  const accepted = [];
  const rejected = [];

  for (const raw of ids) {
    const id = toSafeInt(raw);
    if (id == null) {
      rejected.push(raw);
      continue;
    }

    if (existsId(id)) {
      rejected.push(id);
      continue;
    }

    pendingAddIds.add(id);
    accepted.push(id);
  }

  if (accepted.length) bumpRevision();
  return { accepted, rejected };
}

function enqueueMutations({ selectAdd = [], selectRemove = [], reorders = [] }) {
  let changed = false;

  for (const raw of selectAdd) {
    const id = toSafeInt(raw);
    if (id == null) continue;
    if (!existsId(id)) continue; 

    if (pendingSelectRemove.delete(id)) changed = true;

    if (isSelectedEffective(id)) continue;

    seq += 1;
    pendingSelectAdd.set(id, seq);
    changed = true;
  }

  for (const raw of selectRemove) {
    const id = toSafeInt(raw);
    if (id == null) continue;

    if (pendingSelectAdd.delete(id)) changed = true;

    if (!isSelectedEffective(id)) continue;

    pendingSelectRemove.add(id);
    changed = true;
  }

  for (const r of reorders) {
    if (!r) continue;
    const activeId = toSafeInt(r.activeId);
    const overId = r.overId == null ? null : toSafeInt(r.overId);
    if (activeId == null) continue;

    seq += 1;
    pendingReorders.set(activeId, { overId, seq });
    changed = true;
  }

  if (changed) bumpRevision();
  return { changed, revision };
}

function flushAdds() {
  if (pendingAddIds.size === 0) return;

  for (const id of pendingAddIds) {
    if (id >= BASE_MIN && id <= BASE_MAX) continue;
    extras.add(id);
  }

  pendingAddIds.clear();
  extrasSorted = Array.from(extras).sort((a, b) => a - b);
  bumpRevision();
}

function flushMutations() {
  if (
    pendingSelectAdd.size === 0 &&
    pendingSelectRemove.size === 0 &&
    pendingReorders.size === 0
  ) {
    return;
  }

  if (pendingSelectRemove.size) {
    const toRemove = pendingSelectRemove;
    selectedOrder = selectedOrder.filter((id) => !toRemove.has(id));
    for (const id of toRemove) selectedSet.delete(id);
  }

  if (pendingSelectAdd.size) {
    const adds = Array.from(pendingSelectAdd.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);

    for (const id of adds) {
      if (pendingSelectRemove.has(id)) continue;
      if (!existsId(id)) continue;
      if (selectedSet.has(id)) continue;
      selectedSet.add(id);
      selectedOrder.push(id);
    }
  }

  if (pendingReorders.size) {
    const ops = Array.from(pendingReorders.entries())
      .map(([activeId, v]) => ({ activeId, overId: v.overId, seq: v.seq }))
      .sort((a, b) => a.seq - b.seq);

    const index = new Map();
    for (let i = 0; i < selectedOrder.length; i++) index.set(selectedOrder[i], i);

    for (const op of ops) {
      const { activeId, overId } = op;
      const from = index.get(activeId);
      if (from == null) continue;

      let to;
      if (overId == null) {
        to = selectedOrder.length - 1;
      } else {
        const overIdx = index.get(overId);
        if (overIdx == null) {
          to = selectedOrder.length - 1;
        } else {
          to = overIdx;
        }
      }

      if (from === to) continue;

      const [moved] = selectedOrder.splice(from, 1);
      const insertAt = from < to ? to - 1 : to;
      selectedOrder.splice(insertAt, 0, moved);

      const lo = Math.min(from, insertAt);
      const hi = Math.max(from, insertAt);
      for (let i = lo; i <= hi; i++) index.set(selectedOrder[i], i);
    }
  }

  pendingSelectAdd.clear();
  pendingSelectRemove.clear();
  pendingReorders.clear();

  bumpRevision();
}

// --- Pagination helpers ---

function nextBaseUnfiltered(after) {
  if (after < BASE_MIN) return BASE_MIN;
  const n = after + 1;
  return n <= BASE_MAX ? n : Infinity;
}

function* prefixRanges(prefixNum, max) {
  for (let k = 0; ; k++) {
    const pow = 10 ** k;
    const start = prefixNum * pow;
    if (start > max) return;
    const end = Math.min((prefixNum + 1) * pow - 1, max);
    yield [start, end];
  }
}

function nextBaseWithPrefix(prefixStr, after) {
  if (!prefixStr) return nextBaseUnfiltered(after);
  if (prefixStr.startsWith('-')) return Infinity;
  if (prefixStr.length > 1 && prefixStr.startsWith('0')) return Infinity;

  const prefixNum = Number(prefixStr);
  if (!Number.isSafeInteger(prefixNum)) return Infinity;

  for (const [start0, end0] of prefixRanges(prefixNum, BASE_MAX)) {
    const start = Math.max(start0, BASE_MIN);
    const end = end0;
    if (after < start) return start;
    if (after >= start && after < end) return after + 1;
  }

  return Infinity;
}

function buildAllExtrasSorted() {
  if (pendingAddIds.size === 0) return extrasSorted;
  const pending = Array.from(pendingAddIds).filter((id) => id < BASE_MIN || id > BASE_MAX);
  if (pending.length === 0) return extrasSorted;

  pending.sort((a, b) => a - b);
  const merged = [];
  let i = 0;
  let j = 0;
  while (i < extrasSorted.length || j < pending.length) {
    const a = i < extrasSorted.length ? extrasSorted[i] : Infinity;
    const b = j < pending.length ? pending[j] : Infinity;
    if (a === b) {
      merged.push(a);
      i++;
      j++;
    } else if (a < b) {
      merged.push(a);
      i++;
    } else {
      merged.push(b);
      j++;
    }
  }
  return merged;
}

function nextExtra(after, q, allExtrasSorted) {
  const i0 = binarySearchFirstGreater(allExtrasSorted, after);
  if (!q) return i0 < allExtrasSorted.length ? allExtrasSorted[i0] : Infinity;

  for (let i = i0; i < allExtrasSorted.length; i++) {
    const id = allExtrasSorted[i];
    if (startsWithId(id, q)) return id;
  }
  return Infinity;
}

function getLeftPage({ q, cursor, limit }) {
  const allExtrasSorted = buildAllExtrasSorted();

  let after;
  if (cursor == null || cursor === '') after = -Number.MAX_SAFE_INTEGER;
  else {
    const c = toSafeInt(cursor);
    after = c == null ? -Number.MAX_SAFE_INTEGER : c;
  }

  const items = [];
  let scanned = 0;

  while (items.length < limit) {
    scanned += 1;
    if (scanned > 5_000_000) break; 

    const nextB = q ? nextBaseWithPrefix(q, after) : nextBaseUnfiltered(after);
    const nextE = nextExtra(after, q, allExtrasSorted);
    const candidate = Math.min(nextB, nextE);
    if (!Number.isFinite(candidate)) break;

    after = candidate;

    if (isSelectedEffective(candidate)) continue;

    if (q && candidate <= BASE_MAX && !startsWithId(candidate, q)) continue;

    items.push({ id: candidate });
  }

  const peekB = q ? nextBaseWithPrefix(q, after) : nextBaseUnfiltered(after);
  const peekE = nextExtra(after, q, allExtrasSorted);
  const hasMore = Number.isFinite(Math.min(peekB, peekE));

  return {
    items,
    nextCursor: hasMore ? after : null,
    hasMore
  };
}

let effectiveCache = { revision: 0, order: [] };

function computeEffectiveSelectedOrder() {
  if (effectiveCache.revision === revision) return effectiveCache.order;

  const order = [];

  for (const id of selectedOrder) {
    if (pendingSelectRemove.has(id)) continue;
    order.push(id);
  }

  const adds = Array.from(pendingSelectAdd.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
    .filter((id) => !pendingSelectRemove.has(id));

  const seen = new Set(order);
  for (const id of adds) {
    if (seen.has(id)) continue;
    if (!existsId(id)) continue;
    order.push(id);
    seen.add(id);
  }

  if (pendingReorders.size) {
    const ops = Array.from(pendingReorders.entries())
      .map(([activeId, v]) => ({ activeId, overId: v.overId, seq: v.seq }))
      .sort((a, b) => a.seq - b.seq);

    const index = new Map();
    for (let i = 0; i < order.length; i++) index.set(order[i], i);

    for (const op of ops) {
      const from = index.get(op.activeId);
      if (from == null) continue;

      let to;
      if (op.overId == null) {
        to = order.length - 1;
      } else {
        const overIdx = index.get(op.overId);
        to = overIdx == null ? order.length - 1 : overIdx;
      }

      if (from === to) continue;
      const [moved] = order.splice(from, 1);
      const insertAt = from < to ? to - 1 : to;
      order.splice(insertAt, 0, moved);

      const lo = Math.min(from, insertAt);
      const hi = Math.max(from, insertAt);
      for (let i = lo; i <= hi; i++) index.set(order[i], i);
    }
  }

  effectiveCache = { revision, order };
  return order;
}

function getRightPage({ q, cursor, limit }) {
  const order = computeEffectiveSelectedOrder();

  let i;
  if (cursor == null || cursor === '') i = 0;
  else {
    const c = toSafeInt(cursor);
    i = c == null ? 0 : Math.max(0, c);
  }

  const items = [];
  while (i < order.length && items.length < limit) {
    const id = order[i];
    i += 1;
    if (!startsWithId(id, q)) continue;
    items.push({ id });
  }

  const hasMore = i < order.length;
  return {
    items,
    nextCursor: hasMore ? i : null,
    hasMore,
    totalSelected: order.length
  };
}

function getMeta() {
  return {
    revision,
    totalSelected: computeEffectiveSelectedOrder().length,
    pending: {
      add: pendingAddIds.size,
      selectAdd: pendingSelectAdd.size,
      selectRemove: pendingSelectRemove.size,
      reorders: pendingReorders.size
    }
  };
}

module.exports = {
  BASE_MIN,
  BASE_MAX,
  getMeta,
  getLeftPage,
  getRightPage,
  enqueueAdds,
  enqueueMutations,
  flushAdds,
  flushMutations
};
