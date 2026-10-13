// FOOTBALL WORLD API proxy
import express from 'express';
import cors from 'cors';

const { FOOTBALL_DATA_TOKEN, PORT = 3000, ALLOWED_ORIGIN = '*' } = process.env;
const BASE = 'https://api.football-data.org/v4';
const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));

const cache = new Map();
async function upstream(path, ttlMs) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  if (!FOOTBALL_DATA_TOKEN) throw Object.assign(new Error('FOOTBALL_DATA_TOKEN is not set'), { status: 503 });
  const r = await fetch(BASE + path, { headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN } });
  if (!r.ok) throw Object.assign(new Error('Upstream ' + r.status), { status: r.status === 429 ? 429 : 502 });
  const v = await r.json();
  cache.set(path, { t: Date.now(), v });
  return v;
}

const COMP = { PL: 'pl', PD: 'laliga', SA: 'seriea', BL1: 'bund', FL1: 'ligue1', PPL: 'ptl', DED: 'ned', CL: 'ucl', EC: 'euro', WC: 'wc' };
const status = s => (['IN_PLAY', 'PAUSED', 'LIVE'].includes(s) ? 'live' : ['FINISHED', 'AWARDED'].includes(s) ? 'ft' : 'up');
const norm = m => ({
  id: String(m.id), comp: COMP[m.competition?.code] || m.competition?.code,
  home: { name: m.homeTeam?.shortName || m.homeTeam?.name }, away: { name: m.awayTeam?.shortName || m.awayTeam?.name },
  st: status(m.status), hs: m.score?.fullTime?.home ?? 0, as: m.score?.fullTime?.away ?? 0,
  min: m.minute ?? 0, t: m.utcDate,
});

app.get('/api/health', (_q, r) => r.json({ ok: true, keyConfigured: !!FOOTBALL_DATA_TOKEN }));

app.get('/api/matches', async (_q, res, next) => {
  try {
    const d = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const j = await upstream(`/matches?dateFrom=${d(-3)}&dateTo=${d(3)}`, 30000);
    res.json((j.matches || []).map(norm));
  } catch (e) { next(e); }
});

app.get('/api/standings/:code', async (q, res, next) => {
  try {
    const code = q.params.code.toUpperCase();
    if (!COMP[code]) return res.status(404).json({ error: 'unknown competition' });
    const j = await upstream(`/competitions/${code}/standings`, 300000);
    res.json((j.standings?.[0]?.table || []).map(r => ({
      pos: r.position, team: r.team.shortName || r.team.name, p: r.playedGames, w: r.won, d: r.draw, l: r.lost, gd: r.goalDifference, pts: r.points,
    })));
  } catch (e) { next(e); }
});

app.use((e, _q, res, _n) => res.status(e.status || 500).json({ error: e.message }));
app.listen(PORT, () => console.log('FOOTBALL WORLD API on :' + PORT));
