import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { chatsAPI, usersAPI, messagesAPI } from '../services/api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function Chat() {
  const { user, logout } = useAuth();
  const { socket, joinChat, leaveChat, sendMessage, markAsRead, startTyping, stopTyping, onlineUsers } = useSocket();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('message:new', (message) => {
        if (selectedChat && message.chat === selectedChat._id) {
          setMessages(prev => [...prev, message]);
          markAsRead(selectedChat._id);
        }
        loadChats();
      });

      socket.on('message:edited', (message) => {
        setMessages(prev => prev.map(m => m._id === message._id ? message : m));
      });

      socket.on('message:deleted', ({ messageId }) => {
        setMessages(prev => prev.filter(m => m._id !== messageId));
      });

      return () => {
        socket.off('message:new');
        socket.off('message:edited');
        socket.off('message:deleted');
      };
    }
  }, [socket, selectedChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (selectedChat) {
      joinChat(selectedChat._id);
      loadMessages(selectedChat._id);
      markAsRead(selectedChat._id);
      return () => {
        leaveChat(selectedChat._id);
      };
    }
  }, [selectedChat]);

  const loadChats = async () => {
    try {
      const response = await chatsAPI.getAll();
      setChats(response.data.data.chats);
    } catch (err) {
      console.error('Error loading chats:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId) => {
    try {
      const response = await chatsAPI.getMessages(chatId);
      setMessages(response.data.data.messages);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await usersAPI.search(query);
      setSearchResults(response.data.data.users);
    } catch (err) {
      console.error('Error searching users:', err);
    }
  };

  const startPrivateChat = async (userId) => {
    try {
      const response = await chatsAPI.createPrivate(userId);
      setChats(prev => [response.data.data.chat, ...prev]);
      setSelectedChat(response.data.data.chat);
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedChat || sending) return;

    setSending(true);
    const content = messageInput.trim();
    setMessageInput('');

    sendMessage(selectedChat._id, content, 'text');
    setSending(false);
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);
    
    if (selectedChat) {
      startTyping(selectedChat._id);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(selectedChat._id);
      }, 1000);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return 'Сегодня';
    } else if (d.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    }
    return d.toLocaleDateString('ru-RU');
  };

  const getChatName = (chat) => {
    if (chat.type === 'group') return chat.name;
    const otherParticipant = chat.participants?.find(p => p.user._id !== user.id);
    return otherParticipant?.user?.username || 'Unknown';
  };

  const getChatAvatar = (chat) => {
    if (chat.type === 'group') {
      return chat.avatar || null;
    }
    const otherParticipant = chat.participants?.find(p => p.user._id !== user.id);
    return otherParticipant?.user?.avatar || null;
  };

  const isUserOnline = (userId) => {
    return onlineUsers.has(userId);
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div></div>;
  }

  return (
    <div className="chat-page">
      {/* Sidebar */}
      <div className={`chat-sidebar ${selectedChat ? 'hidden' : ''}`}>
        <div className="chat-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="chat-avatar">
              {user.avatar ? (
                <img src={API_URL + user.avatar} alt="" />
              ) : (
                user.username[0].toUpperCase()
              )}
            </div>
            <span style={{ fontWeight: 600 }}>{user.username}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-icon btn-secondary" onClick={() => setShowSearch(true)} title="New chat">
              +
            </button>
            <button className="btn btn-icon btn-secondary" onClick={logout} title="Logout">
              ↪
            </button>
          </div>
        </div>

        <div className="chat-search">
          <input
            type="text"
            className="chat-search-input"
            placeholder="Поиск чатов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="chat-list">
          {chats
            .filter(chat => chat.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
              chat.lastMessage?.content?.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(chat => (
              <div
                key={chat._id}
                className={`chat-list-item ${selectedChat?._id === chat._id ? 'active' : ''}`}
                onClick={() => setSelectedChat(chat)}
              >
                <div className="chat-avatar">
                  {getChatAvatar(chat) ? (
                    <img src={API_URL + getChatAvatar(chat)} alt="" />
                  ) : (
                    getChatName(chat)[0].toUpperCase()
                  )}
                  {chat.type === 'private' && (
                    <div className={`chat-avatar-status ${isUserOnline(chat.participants?.find(p => p.user._id !== user.id)?.user._id) ? 'online' : 'offline'}`}></div>
                  )}
                </div>
                <div className="chat-info">
                  <div className="chat-name">{getChatName(chat)}</div>
                  <div className="chat-last-message">
                    {chat.lastMessage?.content || 'Нет сообщений'}
                  </div>
                </div>
                <div className="chat-meta">
                  {chat.lastMessage && (
                    <>
                      <div className="chat-time">{formatTime(chat.lastMessage.createdAt)}</div>
                      {chat.unreadCount > 0 && (
                        <div className="chat-unread">{chat.unreadCount}</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Chat Main */}
      {selectedChat ? (
        <div className="chat-main">
          <div className="chat-header">
            <div className="chat-header-info">
              <button className="btn btn-icon btn-secondary" onClick={() => setSelectedChat(null)} title="Back">
                ←
              </button>
              <div className="chat-avatar" style={{ width: 40, height: 40 }}>
                {getChatAvatar(selectedChat) ? (
                  <img src={API_URL + getChatAvatar(selectedChat)} alt="" />
                ) : (
                  getChatName(selectedChat)[0].toUpperCase()
                )}
              </div>
              <div>
                <div className="chat-header-title">{getChatName(selectedChat)}</div>
                <div className="chat-header-subtitle">
                  {selectedChat.type === 'group' 
                    ? `${selectedChat.participants?.length || 0} участников`
                    : isUserOnline(selectedChat.participants?.find(p => p.user._id !== user.id)?.user._id) 
                      ? 'онлайн' 
                      : 'офлайн'}
                </div>
              </div>
            </div>
            <div className="chat-header-actions">
              <Link to="/profile" className="btn btn-icon btn-secondary" title="Profile">
                👤
              </Link>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((msg, index) => {
              const showDate = index === 0 || 
                formatDate(msg.createdAt) !== formatDate(messages[index - 1].createdAt);
              
              return (
                <React.Fragment key={msg._id}>
                  {showDate && (
                    <div className="date-separator">{formatDate(msg.createdAt)}</div>
                  )}
                  <div className={`message ${msg.sender._id === user.id ? 'outgoing' : 'incoming'}`}>
                    <div className="message-bubble">
                      {msg.type === 'image' ? (
                        <div className="message-image">
                          <img src={API_URL + msg.attachments[0]?.url} alt="" />
                        </div>
                      ) : (
                        <>
                          {msg.content}
                          {msg.isEdited && <span className="message-edited">(ред.)</span>}
                        </>
                      )}
                    </div>
                    <div className="message-time">
                      {formatTime(msg.createdAt)}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-container" onSubmit={handleSendMessage}>
            <div className="chat-input-wrapper">
              <button type="button" className="chat-input-btn" title="Attach file">
                📎
              </button>
              <input
                type="text"
                className="chat-input"
                placeholder="Написать сообщение..."
                value={messageInput}
                onChange={handleTyping}
              />
              <button type="submit" className="chat-send-btn" disabled={!messageInput.trim() || sending}>
                ➤
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="chat-main">
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div className="chat-empty-title">Выберите чат</div>
            <div className="chat-empty-subtitle">Начните общение с друзьями</div>
            <button className="btn btn-primary" onClick={() => setShowSearch(true)}>
              + Новый чат
            </button>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showSearch && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            width: '90%',
            maxWidth: 400
          }}>
            <h3 style={{ marginBottom: 16 }}>Новый чат</h3>
            <input
              type="text"
              className="form-input"
              placeholder="Поиск пользователей..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ marginBottom: 16 }}
            />
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {searchResults.map(u => (
                <div
                  key={u._id}
                  className="chat-list-item"
                  onClick={() => startPrivateChat(u._id)}
                >
                  <div className="chat-avatar" style={{ width: 40, height: 40 }}>
                    {u.avatar ? (
                      <img src={API_URL + u.avatar} alt="" />
                    ) : (
                      u.username[0].toUpperCase()
                    )}
                  </div>
                  <div className="chat-info">
                    <div className="chat-name">{u.username}</div>
                    <div className="chat-last-message">{u.email}</div>
                  </div>
                </div>
              ))}
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ marginTop: 16, width: '100%' }}
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;
