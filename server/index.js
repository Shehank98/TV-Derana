const path = require('path');
const express = require('express');
const { migrate, query } = require('./db');
const { seedIfEmpty } = require('./seed');

const app = express();
app.disable('x-powered-by');
app.use('/api', (req, res, next) => (req.path === '/schedules/parse' ? next() : express.json({ limit: '5mb' })(req, res, next)));

app.get('/api/health', async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});
app.use('/api', require('./routes/ratecard'));
app.use('/api', require('./routes/clients'));
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/schedules'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message, duplicate: err.duplicate || undefined });
});

async function start() {
  await migrate();
  await seedIfEmpty();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`TV Derana schedule system on http://localhost:${port}`));
}

if (require.main === module) {
  start().catch((e) => { console.error('Startup failed:', e); process.exit(1); });
}

module.exports = { app, start };
