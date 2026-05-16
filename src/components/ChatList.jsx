import { MessageCircle } from 'lucide-react'

export default function ChatList({ chats, selectedChatId, currentUserId, onSelect }) {
  if (chats.length === 0) {
    return (
      <div className="empty-state">
        <MessageCircle size={34} />
        <p>Find a user by email, phone, or UID to start a conversation.</p>
      </div>
    )
  }

  return (
    <div className="chat-list">
      {chats.map((chat) => {
        const peerId = chat.members.find((member) => member !== currentUserId) || currentUserId
        const peer = chat.memberInfo?.[peerId] || {}
        const active = selectedChatId === chat.id

        return (
          <button
            className={`chat-list-item ${active ? 'chat-list-item-active' : ''}`}
            key={chat.id}
            onClick={() => onSelect(chat)}
            type="button"
          >
            <span className="avatar">{(peer.displayName || 'C').slice(0, 1).toUpperCase()}</span>
            <span className="chat-list-copy">
              <strong>{peer.displayName || peer.email || peer.phoneNumber || 'Contact'}</strong>
              <small>{chat.lastMessage || 'No messages yet'}</small>
            </span>
            {chat.unreadCount > 0 && (
              <span className="unread-badge" aria-label={`${chat.unreadCount} unread messages`}>
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
