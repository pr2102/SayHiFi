import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import Chats from './pages/Chats'
import ChatRoom from './pages/ChatRoom'
import Login from './pages/Login'

function Shell() {
  const { user, loading } = useAuth()
  const [selectedChat, setSelectedChat] = useState(null)

  if (loading) {
    return <div className="loading-screen">Loading SayHiFi...</div>
  }

  if (!user) return <Login />

  return (
    <div className="app-shell">
      <Chats user={user} selectedChatId={selectedChat?.id} onSelectChat={setSelectedChat} />
      <ChatRoom chat={selectedChat} user={user} />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}

export default App
