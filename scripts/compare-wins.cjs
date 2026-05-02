const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function profile(label, start, end) {
  const { data } = await sb.from('parlays')
    .select('status, combined_decimal, confidence, ev_percent, legs_total, sports, slate_id, archived_at, legs')
    .gte('created_at', start).lt('created_at', end).neq('status','pending');
  const rows = (data || []).filter(p => !p.archived_at);
  const wins = rows.filter(p => p.status === 'won');
  const losses = rows.filter(p => p.status === 'lost');

  const stat = (rs) => ({
    n: rs.length,
    avgConf: rs.length ? (rs.reduce((s,p) => s + (p.confidence || 0), 0) / rs.length).toFixed(1) : 0,
    avgDec: rs.length ? (rs.reduce((s,p) => s + (p.combined_decimal || 0), 0) / rs.length).toFixed(1) : 0,
    avgEv: rs.length ? (rs.reduce((s,p) => s + (p.ev_percent || 0), 0) / rs.length).toFixed(1) : 0,
    avgLegs: rs.length ? (rs.reduce((s,p) => s + (p.legs_total || 0), 0) / rs.length).toFixed(1) : 0,
  });

  const sportCount = (rs) => {
    const m = {};
    for (const p of rs) for (const s of (p.sports || [])) m[s] = (m[s] || 0) + 1;
    return Object.entries(m).sort((a,b) => b[1] - a[1]).map(([s,n]) => s + '=' + n).join(', ');
  };

  const marketCount = (rs) => {
    const m = {};
    for (const p of rs) for (const l of (p.legs || [])) m[l.market || '?'] = (m[l.market || '?'] || 0) + 1;
    return Object.entries(m).sort((a,b) => b[1] - a[1]).map(([s,n]) => s + '=' + n).join(', ');
  };

  console.log('═══ ' + label + ' ═══');
  const ws = stat(wins);
  const ls = stat(losses);
  console.log('  WINS  n=' + ws.n + '  conf=' + ws.avgConf + '%  dec=' + ws.avgDec + 'x  ev=' + ws.avgEv + '%  legs=' + ws.avgLegs);
  console.log('  LOSS  n=' + ls.n + '  conf=' + ls.avgConf + '%  dec=' + ls.avgDec + 'x  ev=' + ls.avgEv + '%  legs=' + ls.avgLegs);
  console.log('  WINS  sports: ' + sportCount(wins));
  console.log('  LOSS  sports: ' + sportCount(losses));
  console.log('  WINS  markets: ' + marketCount(wins));
  console.log('  LOSS  markets: ' + marketCount(losses));
  console.log('');
}

(async () => {
  await profile('GREEN — Apr 25-26', '2026-04-25', '2026-04-27');
  await profile('RED   — Apr 28-29', '2026-04-28', '2026-04-30');
})();
