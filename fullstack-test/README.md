# Fullstack test (Express + React)

Two-pane UI for selecting items out of a virtual list of 1,000,000 IDs with filtering, infinite scroll, DnD sorting, and server-side in-memory persistence.

## Features covered
- **Left pane**: virtual list of IDs (1..1_000_000 + manually added IDs), filter by ID prefix, infinite scroll (20 per page), add new IDs.
- **Right pane**: selected items, filter by ID prefix, infinite scroll (20 per page), drag&drop sorting (also when filtered).
- **Persistence**: selection + order live on the server (in-memory for app lifetime). Search text is NOT persisted.
- **Queues**:
  - client-side **GET queue**: dedup + rate-limit/batching (<= 1 request/sec per unique query)
  - client-side **MUTATION queue**: dedup + batched submit every 1 sec
  - client-side **ADD queue**: dedup + batched submit every 10 sec
  - server-side pending queues mirror the same timing (so refresh within the batching window still reflects your latest actions).

## Local run (dev)
### 1) Backend
```bash
cd server
npm i
npm run dev
```
Backend: http://localhost:3001

### 2) Frontend
```bash
cd client
npm i
npm run dev
```
Frontend: http://localhost:5173

> In dev the frontend calls the backend via Vite proxy.

## Production build (single deploy)
```bash
cd client
npm i
npm run build

cd ../server
npm i
npm run start
```
The server will serve `client/dist` statics.

## Docker
```bash
docker build -t fullstack-test .
docker run -p 3001:3001 fullstack-test
```

## Deployment (one service)
Any Node hosting (Render/Railway/Fly/Heroku-like) works:
- set `PORT` env (default 3001)
- run `npm run build` in `client`, then start `server` (or use the provided Dockerfile).

---

### API quick reference
- `GET /api/meta`
- `GET /api/items/left?q=&cursor=&limit=20`
- `GET /api/items/right?q=&cursor=&limit=20` (cursor is **index** in selected order)
- `POST /api/ops/add` `{ ids: number[] }`
- `POST /api/ops/mutate` `{ selectAdd?: number[], selectRemove?: number[], reorders?: {activeId:number, overId:number|null}[] }`
