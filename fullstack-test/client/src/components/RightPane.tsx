import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { api, Item, mutationQueue } from '../api/batchedClient';
import { LocalActionContext } from '../App';
import SortableRow from './SortableRow';

export default function RightPane({ refreshKey }: { refreshKey: number }) {
  const localAction = useContext(LocalActionContext);

  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const r = await api.rightPage({ q, cursor, limit: 20 });
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

  const onRemove = (id: number) => {
    localAction?.markAction();
    mutationQueue.removeSelect(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const ids = useMemo(() => items.map((x) => x.id), [items]);

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = Number(event.active.id);
    const overId = event.over ? Number(event.over.id) : null;
    if (!Number.isFinite(activeId)) return;

    localAction?.markAction();

    if (overId == null) {
      mutationQueue.reorder(activeId, null);
      // local: move to end
      setItems((prev) => {
        const oldIndex = prev.findIndex((x) => x.id === activeId);
        if (oldIndex === -1) return prev;
        return arrayMove(prev, oldIndex, prev.length - 1);
      });
      return;
    }

    if (activeId === overId) return;

    mutationQueue.reorder(activeId, overId);

    setItems((prev) => {
      const oldIndex = prev.findIndex((x) => x.id === activeId);
      const newIndex = prev.findIndex((x) => x.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  return (
    <div className="pane">
      <div className="pane-header">
        <p className="pane-title">Right — selected</p>
        <span className="small">(order is server-side)</span>
      </div>

      <div className="controls">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.trim())}
          placeholder="Filter by ID (prefix)"
          inputMode="numeric"
        />
        <div className="small">Drag&Drop works even for filtered list. Network: GET ≤1/sec, mutations batched every 1s.</div>
      </div>

      <div className="list" ref={listRef}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {items.map((it) => (
              <SortableRow key={it.id} id={it.id} onRemove={onRemove} />
            ))}
          </SortableContext>
        </DndContext>

        <div ref={sentinelRef} />
        <div className="sentinel">
          {loading ? 'Loading…' : hasMore ? 'Scroll to load more' : 'End'}
        </div>
      </div>
    </div>
  );
}
