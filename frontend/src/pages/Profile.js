import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usersAPI, uploadsAPI } from '../services/api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user.username || '');
  const [statusMessage, setStatusMessage] = useState(user.statusMessage || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Пожалуйста, выберите изображение');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Размер файла не должен превышать 5MB');
      return;
    }

    setAvatarFile(file);
    setError('');
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Upload avatar if changed
      if (avatarFile) {
        await uploadsAPI.uploadAvatar(avatarFile);
      }

      // Update profile
      const result = await updateProfile({ username, statusMessage });
      
      if (result.success) {
        setSuccess('Профиль успешно обновлён');
        setAvatarFile(null);
      } else {
        setError(result.error || 'Ошибка обновления профиля');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сервера');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-header">
          <Link to="/" className="profile-back-btn">
            ←
          </Link>
          <h1 className="profile-title">Профиль</h1>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && (
          <div style={{ 
            background: '#e8f5e9', 
            color: '#2e7d32', 
            padding: '12px 16px', 
            borderRadius: 8, 
            marginBottom: 16 
          }}>
            {success}
          </div>
        )}

        <div className="profile-avatar-section">
          <div className="profile-avatar">
            {user.avatar ? (
              <img 
                src={avatarFile ? URL.createObjectURL(avatarFile) : API_URL + user.avatar} 
                alt="" 
              />
            ) : (
              user.username[0].toUpperCase()
            )}
            <label className="profile-avatar-edit">
              Изменить
              <input 
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </label>
          </div>
          <div className="profile-username">{user.username}</div>
        </div>

        <div className="form-group">
          <label className="form-label">Имя пользователя</label>
          <input
            type="text"
            className="form-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={30}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input
            type="email"
            className="form-input"
            value={user.email}
            disabled
            style={{ background: '#f5f5f5' }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Статус</label>
          <input
            type="text"
            className="form-input"
            placeholder="Расскажите, чем вы занимаетесь..."
            value={statusMessage}
            onChange={(e) => setStatusMessage(e.target.value)}
            maxLength={100}
          />
        </div>

        <button 
          className="btn btn-primary btn-block" 
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>

        <button 
          className="btn btn-secondary btn-block" 
          style={{ marginTop: 12 }}
          onClick={handleLogout}
        >
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}

export default Profile;
