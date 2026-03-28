import React, { useContext, useEffect, useRef, useState } from 'react';
import { api, Item, addQueue, mutationQueue } from '../api/batchedClient';
import { LocalActionContext } from '../App';

function parseSafeInt(s: string): number | null {
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

export default function LeftPane({ refreshKey }: { refreshKey: number }) {
  const localAction = useContext(LocalActionContext);

  const [q, setQ] = useState('');
  const [addId, setAddId] = useState('');

  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await api.leftPage({ q, cursor, limit: 20 });
      setItems((prev) => prev.concat(r.items));
      setCursor(r.nextCursor);
      setHasMore(r.hasMore);
    } finally {
      setLoading(false);
    }
  };

  // Reset on search / external refresh
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setLoading(false);

    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, refreshKey]);

  // Infinite scroll observer
  useEffect(() => {
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: '200px 0px 200px 0px' }
    );

    obs.observe(target);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, q, cursor]);

  const onSelect = (id: number) => {
    localAction?.markAction();
    mutationQueue.addSelect(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const onAdd = () => {
    const id = parseSafeInt(addId.trim());
    if (id == null) return;

    localAction?.markAction();
    addQueue.add(id);
    setAddId('');
  };

  return (
    <div className="pane">
      <div className="pane-header">
        <p className="pane-title">Left — available</p>
        <span className="small">(all except selected)</span>
      </div>

      <div className="controls">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.trim())}
          placeholder="Filter by ID (prefix)"
          inputMode="numeric"
        />

        <div className="row">
          <input
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            placeholder="Add new ID (any integer)"
          />
          <button onClick={onAdd} title="Queued (batched every 10s)">
            Add
          </button>
        </div>
        <div className="small">Network: GET batched ≤1/sec, ADD batched every 10s.</div>
      </div>

      <div className="list" ref={listRef}>
        {items.map((it) => (
          <div className="item" key={it.id}>
            <span className="item-id">#{it.id}</span>
            <button onClick={() => onSelect(it.id)} title="Select (batched every 1s)">
              ➜
            </button>
          </div>
        ))}

        <div ref={sentinelRef} />
        <div className="sentinel">
          {loading ? 'Loading…' : hasMore ? 'Scroll to load more' : 'End'}
        </div>
      </div>
    </div>
  );
}
