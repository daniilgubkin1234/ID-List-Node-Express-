# Application (Express + React)

Двухпанельный интерфейс для выбора элементов из виртуального списка из 1 000 000 ID с фильтрацией, бесконечной подгрузкой, drag and drop сортировкой и серверным хранением состояния в памяти.

## Реализованные возможности
- **Левая панель**: виртуальный список ID (от 1 до 1_000_000 + ID, добавленные вручную), фильтрация по префиксу ID, бесконечная подгрузка по 20 элементов, добавление новых ID.
- **Правая панель**: выбранные элементы, фильтрация по префиксу ID, бесконечная подгрузка по 20 элементов, сортировка через drag and drop, в том числе при активной фильтрации.
- **Сохранение состояния**: выбранные элементы и их порядок хранятся на сервере в памяти на всё время работы приложения. Поисковый текст не сохраняется.
- **Очереди**:
  - клиентская **очередь GET-запросов**: дедупликация + ограничение частоты/батчинг, не более 1 запроса в секунду для каждого уникального запроса
  - клиентская **очередь MUTATION-запросов**: дедупликация + пакетная отправка раз в 1 секунду
  - клиентская **очередь ADD-запросов**: дедупликация + пакетная отправка раз в 10 секунд
  - серверные очереди ожидания работают по той же логике и с теми же интервалами, поэтому даже при обновлении страницы в течение окна батчинга последние действия пользователя сохраняются



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
