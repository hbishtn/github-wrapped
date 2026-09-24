import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'

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

  return (
    <div className="app">
      <h1>Welcome, {username}</h1>

      {status === 'idle' && (
        <button onClick={generateWrapped}>Generate My Wrapped</button>
      )}

      {status === 'processing' && <p>Generating... thoda wait kar</p>}

      {status === 'done' && data && (
        <div className="wrapped-card">
          <p>Total Contributions: {data.total_contributions}</p>
          <p>Longest Streak: {data.longest_streak} days</p>
          <p>Top Language: {data.top_language}</p>
          <p>Top Repos: {data.top_repos.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

export default Dashboard