import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => {
        console.log('Socket connected');
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setConnected(false);
      });

      newSocket.on('online:users', (users) => {
        setOnlineUsers(new Set(users));
      });

      newSocket.on('user:online', ({ userId }) => {
        setOnlineUsers(prev => new Set([...prev, userId]));
      });

      newSocket.on('user:offline', ({ userId }) => {
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user]);

  const joinChat = (chatId) => {
    if (socket) {
      socket.emit('join:chat', chatId);
    }
  };

  const leaveChat = (chatId) => {
    if (socket) {
      socket.emit('leave:chat', chatId);
    }
  };

  const sendMessage = (chatId, content, type = 'text', replyTo = null, attachments = []) => {
    if (socket) {
      socket.emit('message:send', { chatId, content, type, replyTo, attachments });
    }
  };

  const markAsRead = (chatId) => {
    if (socket) {
      socket.emit('messages:read', { chatId });
    }
  };

  const startTyping = (chatId) => {
    if (socket) {
      socket.emit('typing:start', { chatId });
    }
  };

  const stopTyping = (chatId) => {
    if (socket) {
      socket.emit('typing:stop', { chatId });
    }
  };

  const value = {
    socket,
    connected,
    onlineUsers,
    joinChat,
    leaveChat,
    sendMessage,
    markAsRead,
    startTyping,
    stopTyping
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
