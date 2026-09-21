import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { bestCharacter, cardTimingStats, formatRate, pickupStats, winRate, winRateByCharacter, winRateTrend } from '../lib/stats'
import type { Run } from '../lib/types'

export function Dashboard({ runs }: { runs: Run[] }) {
  const overall = winRate(runs), best = bestCharacter(runs), characters = Object.entries(winRateByCharacter(runs)).map(([name, stat]) => ({ name, rate: Math.round((stat?.rate ?? 0) * 100), runs: stat?.total ?? 0 }))
  const cards = pickupStats(runs, 'cards', 3).slice(0, 8), timing = cardTimingStats(runs, 10, 3).map((item) => ({ ...item, ratePercent: Math.round(item.rate * 100) })), trend = winRateTrend(runs, 10).map((item) => ({ ...item, ratePercent: Math.round(item.rate * 100) }))
  if (!runs.length) return <section className="empty"><span>0</span><h2>Your first run starts the story.</h2><p>Log a run, then return here as your patterns emerge.</p></section>
  return <div className="dashboard">
    <section className="stat-grid">
      <article className="stat"><span>Tracked runs</span><strong>{runs.length}</strong><small>{overall.total} counted</small></article>
      <article className="stat"><span>Win rate</span><strong>{formatRate(overall.rate)}</strong><small>{overall.wins}W / {overall.losses}L</small></article>
      <article className="stat"><span>Best character</span><strong className="text-stat">{best?.character ?? 'Not enough data'}</strong><small>{best ? formatRate(best.rate) : '3 counted runs required'}</small></article>
    </section>
    <div className="chart-grid">
      <Chart title="Win rate by character" subtitle="Counted runs only"><ResponsiveContainer width="100%" height={260}><BarChart data={characters}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis domain={[0,100]} unit="%"/><Tooltip/><Bar dataKey="rate" radius={[5,5,0,0]}>{characters.map((_, index) => <Cell key={index} fill={['#f08a5d','#b16dff','#5fc2ba','#f3c969','#dc6683'][index % 5]}/>)}</Bar></BarChart></ResponsiveContainer></Chart>
      <Chart title="Recent form" subtitle="Rolling 10-run win rate"><ResponsiveContainer width="100%" height={260}><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="index"/><YAxis domain={[0,100]} unit="%"/><Tooltip/><Line type="monotone" dataKey="ratePercent" stroke="#f08a5d" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></Chart>
      <Chart title="Card pick timing" subtitle="Win rate by acquisition floor · minimum 3 pickups" wide>{timing.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={timing}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="band"/><YAxis domain={[0,100]} unit="%"/><Tooltip formatter={(value, name) => name === 'ratePercent' ? [`${value}%`, 'Win rate'] : [value, name]}/><Bar dataKey="ratePercent" fill="#5fc2ba" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer> : <NoData>Include floors on at least three card pickups to see when your choices pay off.</NoData>}</Chart>
      <Chart title="Card signals" subtitle="Cards ever owned, including removed · lift versus overall win rate · minimum 3 runs" wide>{cards.length ? <div className="signal-list">{cards.map((card) => <div key={card.name}><span>{card.name}<small>{card.runs} runs · {card.removalTrackedRuns ? `removed in ${card.removedRuns}/${card.removalTrackedRuns} logged` : 'removal history unavailable'}</small></span><strong className={card.lift >= 0 ? 'positive' : 'negative'}>{card.lift >= 0 ? '+' : ''}{card.lift.toFixed(1)} pp</strong></div>)}</div> : <NoData>Repeated card picks will reveal which ones outperform your baseline.</NoData>}</Chart>
    </div>
  </div>
}

function Chart({ title, subtitle, wide, children }: { title: string; subtitle: string; wide?: boolean; children: React.ReactNode }) { return <section className={`panel chart ${wide ? 'wide' : ''}`}><div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section> }
function NoData({ children }: { children: React.ReactNode }) { return <div className="no-data">{children}</div> }
