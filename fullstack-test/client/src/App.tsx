import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, MetaResponse } from './api/batchedClient';
import LeftPane from './components/LeftPane';
import RightPane from './components/RightPane';

export const LocalActionContext = createContext<{ markAction: () => void } | null>(null);

export default function App() {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const lastLocalActionAtRef = useRef(0);
  const lastSeenRevisionRef = useRef<number | null>(null);

  const ctx = useMemo(
    () => ({
      markAction: () => {
        lastLocalActionAtRef.current = Date.now();
      }
    }),
    []
  );

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const m = await api.meta();
        if (!alive) return;
        setMeta(m);

        const prev = lastSeenRevisionRef.current;
        if (prev != null && m.revision !== prev) {
          const idleMs = Date.now() - lastLocalActionAtRef.current;
          if (idleMs > 1200) {
            setRefreshKey((k) => k + 1);
          }
        }
        lastSeenRevisionRef.current = m.revision;
      } catch {
        // ignore transient errors
      }
    };

    // immediate + then every second
    void tick();
    const t = window.setInterval(tick, 1000);

    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  return (
    <LocalActionContext.Provider value={ctx}>
      <div className="app">
        <div className="header">
          <h1>1,000,000 IDs — selection & sorting</h1>
          <div className="meta">
            <span className="badge">Selected: {meta?.totalSelected ?? '—'}</span>
            <span className="badge">Revision: {meta?.revision ?? '—'}</span>
            <span className="badge">
              Pending: {meta ? meta.pending.add + meta.pending.selectAdd + meta.pending.selectRemove + meta.pending.reorders : '—'}
            </span>
          </div>
        </div>

        <div className="panes">
          <LeftPane refreshKey={refreshKey} />
          <RightPane refreshKey={refreshKey} />
        </div>
      </div>
    </LocalActionContext.Provider>
  );
}
