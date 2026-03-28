export type Item = { id: number };

export type PageResponse = {
  items: Item[];
  nextCursor: number | null;
  hasMore: boolean;
  totalSelected?: number;
};

export type MetaResponse = {
  revision: number;
  totalSelected: number;
  pending: {
    add: number;
    selectAdd: number;
    selectRemove: number;
    reorders: number;
  };
};

type Resolver<T> = {
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  exec: () => Promise<T>;
};

function now() {
  return Date.now();
}

class DedupBatchQueue {
  private readonly intervalMs: number;
  private lastFlushAt = 0;
  private timer: number | null = null;

  private jobs = new Map<string, Resolver<any>[] | Resolver<any>>();

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  enqueue<T>(key: string, exec: () => Promise<T>): Promise<T> {
    const existing = this.jobs.get(key);

    const promise = new Promise<T>((resolve, reject) => {
      const r: Resolver<T> = { resolve, reject, exec };
      if (!existing) {
        this.jobs.set(key, [r]);
      } else if (Array.isArray(existing)) {
        existing.push(r);
      } else {
        // should never happen; kept for safety
        this.jobs.set(key, [existing as any, r]);
      }
    });

    this.schedule();
    return promise;
  }

  private schedule() {
    if (this.timer != null) return;

    const elapsed = now() - this.lastFlushAt;
    const delay = this.lastFlushAt === 0 ? 0 : Math.max(0, this.intervalMs - elapsed);

    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private async flush() {
    if (this.jobs.size === 0) return;

    this.lastFlushAt = now();
    const entries = Array.from(this.jobs.entries());
    this.jobs.clear();

    await Promise.all(
      entries.map(async ([, resolvers]) => {
        const list = Array.isArray(resolvers) ? resolvers : [resolvers];
        const exec = list[0]!.exec;

        try {
          const result = await exec();
          list.forEach((r) => r.resolve(result));
        } catch (e) {
          list.forEach((r) => r.reject(e));
        }
      })
    );

    // If something arrived during flush, schedule next tick.
    if (this.jobs.size) this.schedule();
  }
}

// --------------------- Mutation batching (1 req/sec) -------------------------

type ReorderOp = { activeId: number; overId: number | null };

class MutationQueue {
  private readonly intervalMs: number;
  private timer: number | null = null;
  private lastFlushAt = 0;

  private selectAdd = new Set<number>();
  private selectRemove = new Set<number>();
  private reorders = new Map<number, ReorderOp>(); // activeId -> latest

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  addSelect(id: number) {
    this.selectRemove.delete(id);
    this.selectAdd.add(id);
    this.schedule();
  }

  removeSelect(id: number) {
    this.selectAdd.delete(id);
    this.selectRemove.add(id);
    this.schedule();
  }

  reorder(activeId: number, overId: number | null) {
    this.reorders.set(activeId, { activeId, overId });
    this.schedule();
  }

  private schedule() {
    if (this.timer != null) return;

    const elapsed = now() - this.lastFlushAt;
    const delay = this.lastFlushAt === 0 ? 0 : Math.max(0, this.intervalMs - elapsed);

    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private async flush() {
    const hasWork = this.selectAdd.size || this.selectRemove.size || this.reorders.size;
    if (!hasWork) return;

    this.lastFlushAt = now();

    const payload = {
      selectAdd: Array.from(this.selectAdd),
      selectRemove: Array.from(this.selectRemove),
      reorders: Array.from(this.reorders.values())
    };

    // Clear optimistically to allow new ops to be queued during fetch
    this.selectAdd.clear();
    this.selectRemove.clear();
    this.reorders.clear();

    try {
      await fetch('/api/ops/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      // If failed, re-queue (best-effort)
      payload.selectAdd.forEach((id) => this.selectAdd.add(id));
      payload.selectRemove.forEach((id) => this.selectRemove.add(id));
      payload.reorders.forEach((op) => this.reorders.set(op.activeId, op));
    }

    if (this.selectAdd.size || this.selectRemove.size || this.reorders.size) this.schedule();
  }
}

// --------------------- Add batching (1 req/10 sec) ---------------------------

class AddQueue {
  private readonly intervalMs: number;
  private timer: number | null = null;
  private lastFlushAt = 0;

  private ids = new Set<number>();

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  add(id: number) {
    this.ids.add(id);
    this.schedule();
  }

  private schedule() {
    if (this.timer != null) return;

    const elapsed = now() - this.lastFlushAt;
    const delay = this.lastFlushAt === 0 ? 0 : Math.max(0, this.intervalMs - elapsed);

    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private async flush() {
    if (this.ids.size === 0) return;

    this.lastFlushAt = now();

    const payload = { ids: Array.from(this.ids) };
    this.ids.clear();

    try {
      await fetch('/api/ops/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      // retry next tick
      payload.ids.forEach((id) => this.ids.add(id));
    }

    if (this.ids.size) this.schedule();
  }
}

// --------------------- Public API -------------------------------------------

const getQueue = new DedupBatchQueue(1000);
export const mutationQueue = new MutationQueue(1000);
export const addQueue = new AddQueue(10_000);

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

export const api = {
  meta(): Promise<MetaResponse> {
    return getQueue.enqueue('GET:/api/meta', async () => {
      const r = await fetch('/api/meta');
      return json<MetaResponse>(r);
    });
  },

  leftPage(params: { q: string; cursor: number | null; limit?: number }): Promise<PageResponse> {
    const u = new URL('/api/items/left', window.location.origin);
    if (params.q) u.searchParams.set('q', params.q);
    if (params.cursor != null) u.searchParams.set('cursor', String(params.cursor));
    u.searchParams.set('limit', String(params.limit ?? 20));
    const key = `GET:${u.pathname}?${u.searchParams.toString()}`;

    return getQueue.enqueue(key, async () => {
      const r = await fetch(u.pathname + '?' + u.searchParams.toString());
      return json<PageResponse>(r);
    });
  },

  rightPage(params: { q: string; cursor: number | null; limit?: number }): Promise<PageResponse> {
    const u = new URL('/api/items/right', window.location.origin);
    if (params.q) u.searchParams.set('q', params.q);
    if (params.cursor != null) u.searchParams.set('cursor', String(params.cursor));
    u.searchParams.set('limit', String(params.limit ?? 20));
    const key = `GET:${u.pathname}?${u.searchParams.toString()}`;

    return getQueue.enqueue(key, async () => {
      const r = await fetch(u.pathname + '?' + u.searchParams.toString());
      return json<PageResponse>(r);
    });
  }
};
