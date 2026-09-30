import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import './Dashboard.css'

const BACKEND_URL = 'http://localhost:8000'

function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const start = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function Num({ value }) {
  return <>{useCountUp(Number(value) || 0).toLocaleString()}</>
}

function Avatar({ username }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <div className="avatar">{username[0].toUpperCase()}</div>
  return (
    <img
      className="avatar"
      src={`https://github.com/${username}.png?size=200`}
      alt={`${username} on GitHub`}
      onError={() => setBroken(true)}
    />
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_ROWS = { 1: 'Mon', 3: 'Wed', 5: 'Fri' } // weekday index -> label shown on that row

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

/* Builds GitHub-style columns: each column is one week (Sun-Sat), padded so the
   grid lines up under the correct weekday row on both ends. */
function buildWeeks(days) {
  if (!days.length) return []
  const weeks = []
  let col = new Array(days[0].weekday).fill(null) // pad before the first real day
  for (const day of days) {
    col[day.weekday] = day
    if (day.weekday === 6) {
      weeks.push(col)
      col = []
    }
  }
  if (col.length) weeks.push(col)
  return weeks
}

function Heatmap({ days }) {
  if (!days || !days.length) return null
  const weeks = buildWeeks(days)
  const total = days.reduce((sum, d) => sum + d.count, 0)

  const monthLabels = weeks.map((week, i) => {
    const firstDay = week.find(Boolean)
    if (!firstDay) return ''
    const month = new Date(`${firstDay.date}T00:00:00Z`).getUTCMonth()
    const prevWeek = weeks[i - 1]
    const prevDay = prevWeek && prevWeek.find(Boolean)
    const prevMonth = prevDay ? new Date(`${prevDay.date}T00:00:00Z`).getUTCMonth() : -1
    return month !== prevMonth ? MONTHS[month] : ''
  })

  return (
    <div className="heatmap-block">
      <p className="heatmap-total">{total.toLocaleString()} contributions in the last year</p>
      <div className="heatmap-scroll">
        <div className="heatmap-grid" style={{ '--weeks': weeks.length }}>
          <div className="heatmap-months">
            {monthLabels.map((label, i) => <span key={i}>{label}</span>)}
          </div>
          <div className="heatmap-body">
            <div className="heatmap-daylabels">
              {[0, 1, 2, 3, 4, 5, 6].map((w) => <span key={w}>{DAY_ROWS[w] || ''}</span>)}
            </div>
            <div className="heatmap-weeks">
              {weeks.map((week, i) => (
                <div className="heatmap-week" key={i}>
                  {week.map((day, w) =>
                    day ? (
                      <span
                        key={day.date}
                        className={`heatmap-cell l${day.level}`}
                        title={`${day.count} contribution${day.count === 1 ? '' : 's'} on ${fmtDate(day.date)}`}
                      />
                    ) : (
                      <span key={w} className="heatmap-cell empty" />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heatmap-cell l${l}`} />)}
        <span>More</span>
      </div>
    </div>
  )
}

function Tile({ area, color, label, note, index, children }) {
  return (
    <section className={`tile ${color}`} style={{ gridArea: area, '--i': index }}>
      <span className="label">{label}</span>
      <div>
        {children}
        {note && <p className="note">{note}</p>}
      </div>
    </section>
  )
}

function Dashboard() {
  const [params] = useSearchParams()
  const username = params.get('username')

  const [status, setStatus] = useState('idle') // idle | processing | done | error
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  const [range, setRange] = useState('year')
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  const finish = (result) => {
    clearInterval(timer.current)
    setData(result)
    setStatus('done')
  }
  const fail = () => {
    clearInterval(timer.current)
    setStatus('error')
  }

  const generate = async (r = range) => {
    setStatus('processing')
    try {
      const { data: res } = await axios.get(`${BACKEND_URL}/auth/wrapped/${username}/?range=${r}`)
      if (res.status === 'done') return finish(res.data)

      let tries = 0
      timer.current = setInterval(async () => {
        if (++tries > 40) return fail()
        try {
          const { data: r2 } = await axios.get(`${BACKEND_URL}/auth/wrapped/status/${res.task_id}/`)
          if (r2.status === 'done') finish(r2.data)
        } catch {
          fail()
        }
      }, 2000)
    } catch {
      fail()
    }
  }

  const changeRange = (r) => {
    setRange(r)
    generate(r)
  }

  const copySummary = async () => {
    const text =
      `${username}'s GitHub Wrapped: ${data.total_contributions} contributions, ` +
      `${data.longest_streak}-day streak, top language ${data.top_language}. ` +
      `github.com/${username}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked */
    }
  }

  if (!username) {
    return (
      <main className="stage">
        <h1>You're not signed in</h1>
        <p>Sign in with GitHub to generate your Wrapped.</p>
        <Link className="btn" to="/">Go to sign in</Link>
      </main>
    )
  }

  if (status === 'idle') {
    return (
      <main className="stage">
        <Avatar username={username} />
        <h1>Ready, {username}?</h1>
        <p>We'll pull your last 12 months of GitHub activity and turn it into a summary.</p>
        <button className="btn big" onClick={generate}>Generate my Wrapped</button>
      </main>
    )
  }

  if (status === 'processing') {
    return (
      <main className="stage" role="status">
        <div className="loader" />
        <h1>Reading your commits</h1>
        <p>This usually takes a few seconds.</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="stage">
        <h1>Couldn't build your Wrapped</h1>
        <p>GitHub didn't respond or the backend is down. Check that Django, Redis and Celery are running, then try again.</p>
        <button className="btn big" onClick={generate}>Try again</button>
      </main>
    )
  }

  const weekend = data.is_weekend_warrior
  const RANGE_LABELS = { week: 'Last week', month: 'Last month', year: 'This year', lifetime: 'Whole GitHub' }

  return (
    <div className="shell">
      <header className="bar">
        <div className="brand">GitHub Wrapped <span>{RANGE_LABELS[range]}</span></div>
        <div className="actions">
          <select
            className="range-select"
            value={range}
            onChange={(e) => changeRange(e.target.value)}
            aria-label="Time range"
          >
            <option value="week">Last week</option>
            <option value="month">Last month</option>
            <option value="year">This year</option>
            <option value="lifetime">Whole GitHub</option>
          </select>
          <button className="btn ghost" onClick={copySummary}>{copied ? 'Copied' : 'Copy summary'}</button>
          <button className="btn" onClick={() => generate(range)}>Regenerate</button>
        </div>
      </header>

      <main className="grid">
        <section className="tile hero" style={{ gridArea: 'hero', '--i': 0 }}>
          <Avatar username={username} />
          <div>
            <h1>@{username}</h1>
            <p className="persona">{weekend ? 'Weekend Warrior' : 'Weekday Grinder'}</p>
            <p className="note">
              {weekend ? 'Most of your commits land on weekends.' : 'Most of your commits land on weekdays.'}{' '}
              {data.followers_count.toLocaleString()} followers.
            </p>
          </div>
        </section>

        <Tile area="contrib" color="coral big" label="Contributions in the last year" index={1}>
          <span className="value xl"><Num value={data.total_contributions} /></span>
        </Tile>

        <Tile area="streak" color="yellow" label="Longest streak" note="days in a row" index={2}>
          <span className="value"><Num value={data.longest_streak} /></span>
        </Tile>

        <Tile area="lang" color="mint" label="Top language" index={3}>
          <span className="value txt">{data.top_language}</span>
        </Tile>

        <Tile area="prs" color="peri" label="Pull requests" index={4}>
          <span className="value"><Num value={data.total_prs} /></span>
        </Tile>

        <Tile area="issues" color="coral" label="Issues opened" index={5}>
          <span className="value"><Num value={data.total_issues} /></span>
        </Tile>

        <Tile area="repos" color="yellow" label="Repos created" index={6}>
          <span className="value"><Num value={data.total_repos_created} /></span>
        </Tile>

        <Tile area="day" color="peri" label="Most active day" index={7}>
          <span className="value txt">{data.most_active_day}</span>
        </Tile>

        <Tile
          area="top" color="mint" label="Most starred repo" index={8}
          note={`${data.most_starred_repo_stars.toLocaleString()} stars`}
        >
          <span className="value txt">{data.most_starred_repo}</span>
        </Tile>

        <section className="tile list" style={{ gridArea: 'list', '--i': 9 }}>
          <span className="label">Last 12 weeks</span>
          <Heatmap days={data.calendar_days} />
          <span className="label sub">Recently active repos</span>
          <ul>
            {data.top_repos.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </section>
      </main>
    </div>
  )
}

export default Dashboard