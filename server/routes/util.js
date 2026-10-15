function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function requireText(v, field) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  if (!s) throw httpError(400, `${field} is required`);
  return s;
}

function optText(v) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s || null;
}

function num(v, field, { min = -Infinity, max = Infinity, required = true } = {}) {
  if ((v === null || v === undefined || v === '') && !required) return null;
  const n = Number(String(v).replace(/,/g, ''));
  if (!Number.isFinite(n)) throw httpError(400, `${field} must be a number`);
  if (n < min || n > max) throw httpError(400, `${field} must be between ${min} and ${max}`);
  return n;
}

function time(v, field) {
  const s = requireText(v, field);
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m || +m[1] > 24 || +m[2] > 59) throw httpError(400, `${field} must be HH:MM (24-hour)`);
  return `${String(+m[1] % 24).padStart(2, '0')}:${m[2]}`;
}

function id(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, 'Invalid id');
  return n;
}

// Turns Postgres constraint errors into readable 4xx responses.
function pgFriendly(e) {
  if (e.code === '23505') return httpError(409, 'That name already exists.');
  if (e.code === '23503') return httpError(409, 'This item is still used elsewhere (e.g. programs or clients) and cannot be deleted.');
  if (e.code === '23514') return httpError(400, 'A value is out of the allowed range.');
  return e;
}

module.exports = { httpError, requireText, optText, num, time, id, pgFriendly };
