const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const {
  getMeta,
  getLeftPage,
  getRightPage,
  enqueueAdds,
  enqueueMutations,
  flushAdds,
  flushMutations
} = require('./state');

const { clampLimit, normalizeQuery } = require('./utils');

const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// In dev, allow Vite origin. In prod, same-origin.
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (origin.startsWith('http://localhost:5173')) return cb(null, true);
      return cb(null, true);
    },
    credentials: false
  })
);

// --- API --------------------------------------------------------------------

app.get('/api/meta', (req, res) => {
  res.json(getMeta());
});

app.get('/api/items/left', (req, res) => {
  const q = normalizeQuery(req.query.q);
  const limit = clampLimit(req.query.limit, 20, 50);
  const cursor = req.query.cursor;

  res.json(getLeftPage({ q, cursor, limit }));
});

app.get('/api/items/right', (req, res) => {
  const q = normalizeQuery(req.query.q);
  const limit = clampLimit(req.query.limit, 20, 50);
  const cursor = req.query.cursor;

  res.json(getRightPage({ q, cursor, limit }));
});

app.post('/api/ops/add', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const result = enqueueAdds(ids);
  res.status(202).json({ ok: true, ...result });
});

app.post('/api/ops/mutate', (req, res) => {
  const body = req.body || {};
  const selectAdd = Array.isArray(body.selectAdd) ? body.selectAdd : [];
  const selectRemove = Array.isArray(body.selectRemove) ? body.selectRemove : [];
  const reorders = Array.isArray(body.reorders) ? body.reorders : [];

  const result = enqueueMutations({ selectAdd, selectRemove, reorders });
  res.status(202).json({ ok: true, ...result });
});

// --- Static frontend (prod) -------------------------------------------------

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// --- Batching timers --------------------------------------------------------

setInterval(() => {
  try {
    flushMutations();
  } catch (e) {
    console.error('flushMutations error', e);
  }
}, 1000);

setInterval(() => {
  try {
    flushAdds();
  } catch (e) {
    console.error('flushAdds error', e);
  }
}, 10_000);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
