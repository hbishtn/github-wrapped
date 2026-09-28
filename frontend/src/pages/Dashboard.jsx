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

  const generate = async () => {
    setStatus('processing')
    try {
      const { data: res } = await axios.get(`${BACKEND_URL}/auth/wrapped/${username}/`)
      if (res.status === 'done') return finish(res.data)

      let tries = 0
      timer.current = setInterval(async () => {
        if (++tries > 40) return fail()
        try {
          const { data: r } = await axios.get(`${BACKEND_URL}/auth/wrapped/status/${res.task_id}/`)
          if (r.status === 'done') finish(r.data)
        } catch {
          fail()
        }
      }, 2000)
    } catch {
      fail()
    }
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

  const year = new Date(data.generated_at).getFullYear()
  const weekend = data.is_weekend_warrior

  return (
    <div className="shell">
      <header className="bar">
        <div className="brand">GitHub Wrapped <span>{year}</span></div>
        <div className="actions">
          <button className="btn ghost" onClick={copySummary}>{copied ? 'Copied' : 'Copy summary'}</button>
          <button className="btn" onClick={generate}>Regenerate</button>
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
          <span className="label">Recently active repos</span>
          <ul>
            {data.top_repos.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </section>
      </main>
    </div>
  )
}

export default Dashboard