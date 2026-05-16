import { CheckCheck } from 'lucide-react'

export default function ChatBubble({ message, mine }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`chat-bubble ${mine ? 'chat-bubble-mine' : 'chat-bubble-peer'}`}>
        {message.type === 'image' && message.mediaUrl && (
          <img className="chat-media" src={message.mediaUrl} alt="Shared chat media" />
        )}

        {message.type === 'voice' && message.mediaUrl && (
          <audio className="voice-note" src={message.mediaUrl} controls />
        )}

        {message.text && <p>{message.text}</p>}

        {mine && (
          <span className="message-status">
            <CheckCheck size={13} />
            {message.status || 'sent'}
          </span>
        )}
      </div>
    </div>
  )
}
