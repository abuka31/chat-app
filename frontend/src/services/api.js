import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor для добавления токена
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor для обработки ошибок
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// API сервисы
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, username) => api.post('/auth/register', { email, password, username }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me')
};

export const usersAPI = {
  search: (q) => api.get('/users/search', { params: { q } }),
  getById: (id) => api.get(`/users/${id}`),
  updateProfile: (data) => api.put('/users/profile', data),
  updateStatus: (status) => api.put('/users/status', { status })
};

export const chatsAPI = {
  getAll: () => api.get('/chats'),
  getById: (id) => api.get(`/chats/${id}`),
  createPrivate: (userId) => api.post('/chats/private', { userId }),
  createGroup: (name, participants, avatar) => api.post('/chats/group', { name, participants, avatar }),
  update: (id, data) => api.put(`/chats/${id}`, data),
  leave: (id) => api.post(`/chats/${id}/leave`),
  join: (id) => api.post(`/chats/${id}/join`),
  delete: (id) => api.delete(`/chats/${id}`),
  getMessages: (id, page = 1, limit = 50) => api.get(`/chats/${id}/messages`, { params: { page, limit } })
};

export const messagesAPI = {
  send: (chatId, content, type = 'text', replyTo = null, attachments = []) => 
    api.post('/messages', { chatId, content, type, replyTo, attachments }),
  edit: (id, content) => api.put(`/messages/${id}`, { content }),
  delete: (id) => api.delete(`/messages/${id}`),
  getByChat: (chatId, page = 1, limit = 50) => 
    api.get(`/messages/chat/${chatId}`, { params: { page, limit } }),
  search: (q, chatId) => api.get('/messages/search', { params: { q, chatId } })
};

export const uploadsAPI = {
  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post('/uploads/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/uploads/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
