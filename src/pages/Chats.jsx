import { LogOut, Search, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import ChatList from '../components/ChatList'
import { ensureChat, findUserByHandle, listenChats, listenUnreadCount, markChatRead } from '../services/chatService'
import { logout, upsertUserProfile } from '../services/authService'

function isCurrentUserSearch(handle, user) {
  const value = handle.trim().toLowerCase()
  return [user.uid, user.email, user.phoneNumber].filter(Boolean).some((item) => item.toLowerCase() === value)
}

export default function Chats({ user, selectedChatId, onSelectChat }) {
  const [chats, setChats] = useState([])
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const chatIds = chats.map((chat) => chat.id).join('|')

  useEffect(() => {
    return listenChats(user.uid, setChats)
  }, [user.uid])

  useEffect(() => {
    const ids = chatIds ? chatIds.split('|') : []
    const unsubscribers = ids.map((chatId) =>
      listenUnreadCount(chatId, user.uid, (unreadCount) => {
        setChats((currentChats) =>
          currentChats.map((currentChat) =>
            currentChat.id === chatId ? { ...currentChat, unreadCount } : currentChat,
          ),
        )
      }),
    )

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  }, [chatIds, user.uid])

  useEffect(() => {
    upsertUserProfile(user).catch((nextError) => {
      setError(`Could not save your profile: ${nextError.message}`)
    })
  }, [user])

  async function startChat(event) {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      const peer = isCurrentUserSearch(handle, user) ? user : await findUserByHandle(handle)

      if (!peer) {
        setError('No user found. Ask your contact to sign in once first, or search your own email for Saved Messages.')
        return
      }

      const chatId = await ensureChat(user, peer)
      onSelectChat({
        id: chatId,
        members: peer.uid === user.uid ? [user.uid] : [user.uid, peer.uid],
        memberInfo: {
          [user.uid]: {
            displayName: peer.uid === user.uid ? 'Saved Messages' : user.displayName || user.email || 'You',
            email: user.email || '',
            phoneNumber: user.phoneNumber || '',
            photoURL: user.photoURL || '',
          },
          ...(peer.uid !== user.uid && {
            [peer.uid]: {
              displayName: peer.displayName || peer.email || peer.phoneNumber || 'Contact',
              email: peer.email || '',
              phoneNumber: peer.phoneNumber || '',
              photoURL: peer.photoURL || '',
            },
          }),
        },
        typing: {},
      })
      setHandle('')
    } catch (nextError) {
      setError(`Could not start chat: ${nextError.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function selectChat(chat) {
    onSelectChat(chat)
    markChatRead(chat.id, user.uid).catch((nextError) => {
      setError(`Could not mark chat as read: ${nextError.message}`)
    })
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div>
          <h2>SayHiFi</h2>
          <p>{user.displayName || user.phoneNumber || user.email}</p>
        </div>
        <button className="icon-btn" onClick={logout} type="button" title="Sign out">
          <LogOut size={18} />
        </button>
      </header>

      <form className="search-form" onSubmit={startChat}>
        <Search size={18} />
        <input
          onChange={(event) => setHandle(event.target.value)}
          placeholder="Email, phone, or UID"
          value={handle}
        />
        <button className="search-submit" disabled={busy} type="submit" title="Start chat">
          <Send size={17} />
        </button>
      </form>
      {error && <p className="sidebar-error">{error}</p>}

      <ChatList
        chats={chats}
        currentUserId={user.uid}
        onSelect={selectChat}
        selectedChatId={selectedChatId}
      />
    </aside>
  )
}
