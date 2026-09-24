const BACKEND_URL = 'http://localhost:8000'

function Home() {
  const handleLogin = () => {
    window.location.href = `${BACKEND_URL}/auth/login/`
  }

  return (
    <div className="app">
      <h1>GitHub Wrapped</h1>
      <p>Apna GitHub coding activity ka shareable wrapped card banao</p>
      <button onClick={handleLogin}>Login with GitHub</button>
    </div>
  )
}

export default Home