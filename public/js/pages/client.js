// New schedule, step 3: the client's page — past schedules by month and the
// "New schedule" popup (month, number, name, upload → Continue to matching).
import { api, esc, money0, num, pct, setHeader, icon, initials, monthLabel, thisMonth, modal, toast } from '../ui.js';
import { steps, setDraft } from '../flow.js';

let el;

export async function render(root, { agencyId, clientId }) {
  el = root;
  const [agencies, list] = await Promise.all([api('/agencies'), api(`/schedules?agency_id=${agencyId}&client_id=${clientId}`)]);
  const agency = agencies.find((a) => a.id === agencyId);
  const deal = agency && agency.clients.find((c) => c.client_id === clientId);
  if (!agency || !deal) { toast('This client is not linked to that agency any more', 'error'); location.hash = '#/new'; return; }
  setHeader('');

  const months = [];
  for (const s of list) {
    let g = months.find((m) => m.key === s.month);
    if (!g) months.push(g = { key: s.month, rows: [] });
    g.rows.push(s);
  }

  el.innerHTML = `${steps(3, { agency: { id: agency.id, name: agency.name }, client: { id: clientId, name: deal.client_name } })}
    <section class="hero" style="display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:space-between">
      <div class="row" style="gap:18px;flex-wrap:nowrap">
        <span class="avatar" style="width:64px;height:64px;font-size:22px;background:var(--red)">${esc(initials(deal.client_name))}</span>
        <div><h1 style="font-size:30px">${esc(deal.client_name)}</h1>
          <div class="sub" style="margin-top:6px">via ${esc(agency.name)} · ${esc(deal.rate_card_name || 'Base rate card')} · Agreed discount ${num(deal.discount_pct)}%</div></div>
      </div>
      <button class="btn btn-primary btn-lg" id="newSched" style="box-shadow:0 10px 22px rgba(200,16,46,.4)">${icon.plus} New schedule</button>
    </section>
    <div class="row" style="justify-content:space-between;align-items:baseline;margin:26px 0 4px">
      <h2 style="margin:0;font-size:20px">Past schedules</h2>
      <span class="small muted">${list.length ? 'Newest first · click a schedule to open its dashboard' : ''}</span>
    </div>
    ${months.length ? months.map((m, i) => `
      <div class="month-label">${monthLabel(m.key)}</div>
      ${m.rows.map((s, j) => `
        <a class="srow" href="#/schedule/${s.id}" style="animation-delay:${(i + j) * 60}ms">
          <div style="min-width:0"><span class="no">${esc(s.schedule_no)}</span><span class="small muted">${esc(s.title || s.file_name || '')}</span></div>
          <div class="hide-m"><span class="k">Spots</span><b>${num(s.spots, 0)}</b></div>
          <div><span class="k">Rate card value</span><b>${money0(s.trv)}</b></div>
          <div><span class="k">Package</span><b style="color:var(--red)">${money0(s.package)}</b></div>
          <div class="hide-m"><span class="pill-amber">${pct(s.discount_pct)} off</span></div>
          <span class="hide-m">${icon.chev}</span>
        </a>`).join('')}`).join('')
    : `<div class="empty-hero" style="margin-top:12px"><h2>No schedules for ${esc(deal.client_name)} yet</h2><p>Upload the first one and the programs are matched automatically.</p>
        <button class="btn btn-primary" id="newSched2">${icon.plus} New schedule</button></div>`}`;

  const open = () => newSchedulePopup(agency, deal);
  el.querySelector('#newSched').onclick = open;
  const n2 = el.querySelector('#newSched2');
  if (n2) n2.onclick = open;
}

// The popup. Upload states: empty → ready → reading → error.
function newSchedulePopup(agency, deal) {
  let file = null;
  let error = null;
  let reading = false;
  const uploadBox = () => {
    if (!file) {
      return `<label class="drop" id="drop"><span class="ic">${icon.upload}</span><b>Upload the schedule Excel</b>
        <span class="small muted">Drop the .xlsx here or click to browse</span><input type="file" id="file" accept=".xlsx,.xlsm" class="sr"></label>`;
    }
    if (reading) return `<div class="file-pill reading"><span class="spin"></span><div class="fp"><b>${esc(file.name)}</b><span>Reading the schedule and matching programs…</span></div></div>`;
    if (error) {
      return `<div class="file-pill error">${icon.fileBad}<div class="fp"><b>${esc(file.name)}</b><span>${esc(error)}</span></div>
        <label class="btn btn-sm">Choose another<input type="file" id="file" accept=".xlsx,.xlsm" class="sr"></label></div>`;
    }
    return `<div class="file-pill">${icon.file}<div class="fp"><b>${esc(file.name)}</b><span>Ready · ${Math.max(1, Math.round(file.size / 1024))} KB</span></div>
      <label class="btn btn-sm">Change<input type="file" id="file" accept=".xlsx,.xlsm" class="sr"></label></div>`;
  };

  return modal({
    title: 'New schedule',
    sub: `${deal.client_name} · ${agency.name}`,
    okText: 'Continue',
    body: `<div class="stack" style="gap:16px">
      <div class="form-grid">
        <label class="field">Campaign month<input type="month" name="month" value="${thisMonth()}"></label>
        <label class="field">Schedule number<input name="schedule_no" placeholder="e.g. OGL/SLT/2026/046"></label>
        <label class="field full">Schedule name<input name="title" placeholder="e.g. Dream Star season sponsorship"></label>
      </div>
      <div id="up">${uploadBox()}</div>
      <p class="small muted" style="margin:0">Needs PROGRAM, DAY, START / END TIME, DUR and TOTAL SPOTS columns. Rows with no time belt or zero spots are ignored.</p>
    </div>`,
    onOpen: (body) => {
      const up = body.querySelector('#up');
      const take = (f) => {
        if (!f) return;
        file = f;
        error = /\.xls[xm]$/i.test(f.name) ? null
          : /\.xls$/i.test(f.name) ? 'This is an old .xls file. Open it in Excel, Save As .xlsx, then upload that.'
            : 'This is not an Excel file. Please upload the schedule as .xlsx.';
        paint();
      };
      const paint = () => {
        up.innerHTML = uploadBox();
        const input = up.querySelector('#file');
        if (input) input.onchange = () => take(input.files[0]);
        const drop = up.querySelector('#drop');
        if (drop) {
          ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
          ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
          drop.addEventListener('drop', (e) => take(e.dataTransfer.files[0]));
        }
      };
      paint();
      body._paint = paint;
    },
    onOk: async (body) => {
      const month = body.querySelector('[name=month]').value;
      const scheduleNo = body.querySelector('[name=schedule_no]').value.trim();
      const title = body.querySelector('[name=title]').value.trim();
      if (!month) throw new Error('Choose the campaign month');
      if (!scheduleNo) { body.querySelector('[name=schedule_no]').focus(); throw new Error('Enter the schedule number'); }
      if (!file) throw new Error('Upload the schedule Excel');
      if (error) throw new Error(error);
      reading = true; body._paint();
      try {
        const res = await api('/schedules/parse', { method: 'POST', raw: file });
        if (!res.lines.length) throw new Error('No usable rows: every row has no time belt or zero spots.');
        setDraft({ agency_id: agency.id, agency_name: agency.name, client_id: deal.client_id, client_name: deal.client_name,
          discount_pct: Number(deal.discount_pct) || 0, month, schedule_no: scheduleNo, title, file_name: file.name,
          lines: res.lines, skipped: res.skipped });
      } catch (e) {
        reading = false; error = e.message; body._paint();
        return false;
      }
      location.hash = '#/match';
      return true;
    },
  });
}
