import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import './Dashboard.css'

const BACKEND_URL = 'http://localhost:8000'

function Dashboard() {
  const [searchParams] = useSearchParams()
  const username = searchParams.get('username')

  const [status, setStatus] = useState('idle')
  const [data, setData] = useState(null)

  const generateWrapped = async () => {
    setStatus('processing')
    const res = await axios.get(`${BACKEND_URL}/auth/wrapped/${username}/`)

    if (res.data.status === 'done') {
      setData(res.data.data)
      setStatus('done')
    } else {
      pollStatus(res.data.task_id)
    }
  }

  const pollStatus = (taskId) => {
    const interval = setInterval(async () => {
      const res = await axios.get(`${BACKEND_URL}/auth/wrapped/status/${taskId}/`)
      if (res.data.status === 'done') {
        setData(res.data.data)
        setStatus('done')
        clearInterval(interval)
      }
    }, 2000)
  }

  if (status === 'idle') {
    return (
      <div className="page">
        <div className="intro">
          <h1>Welcome, {username}</h1>
          <p>Generate your GitHub activity summary for this year.</p>
          <button className="btn-primary" onClick={generateWrapped}>
            Generate Wrapped
          </button>
        </div>
      </div>
    )
  }

  if (status === 'processing') {
    return (
      <div className="page">
        <div className="loader" />
        <p className="loading-text">Fetching your GitHub data...</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card-header">
          <div className="avatar">{username[0].toUpperCase()}</div>
          <div>
            <h2>{username}</h2>
            <span className="subtitle">GitHub Wrapped · 2026</span>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat">
            <span className="stat-value">{data.total_contributions}</span>
            <span className="stat-label">Contributions</span>
          </div>
          <div className="stat">
            <span className="stat-value">{data.longest_streak}</span>
            <span className="stat-label">Longest Streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">{data.top_language}</span>
            <span className="stat-label">Top Language</span>
          </div>
          <div className="stat">
            <span className="stat-value">{data.total_prs}</span>
            <span className="stat-label">Pull Requests</span>
          </div>
          <div className="stat">
            <span className="stat-value">{data.most_active_day}</span>
            <span className="stat-label">Most Active Day</span>
          </div>
          <div className="stat">
            <span className="stat-value">{data.most_starred_repo}</span>
            <span className="stat-label">Top Repo</span>
          </div>
        </div>

        <div className="card-footer">
          <span>github.com/{username}</span>
        </div>
      </div>

      <button className="btn-secondary" onClick={() => window.location.reload()}>
        Regenerate
      </button>
    </div>
  )
}

export default Dashboard