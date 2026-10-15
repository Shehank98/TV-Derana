const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Return NUMERIC as JS numbers (amounts stay far below float precision limits)
// and TIME as "HH:MM:SS" strings.
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

function sslFor(url) {
  if (process.env.PGSSL === 'false') return false;
  if (process.env.PGSSL === 'true') return { rejectUnauthorized: false };
  // Railway private networking has no TLS; public proxy URLs do.
  if (!url || /localhost|127\.0\.0\.1|\.railway\.internal/.test(url)) return false;
  return { rejectUnauthorized: false };
}

const connectionString = process.env.DATABASE_URL || 'postgres://postgres@localhost:5433/tvderana';
const pool = new Pool({ connectionString, ssl: sslFor(connectionString), max: 10 });

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Applies server/migrations/*.sql once each, in name order.
async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    console.log(`migration applied: ${file}`);
  }
}

module.exports = { pool, query, tx, migrate };
