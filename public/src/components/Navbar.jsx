import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

export default function Navbar({ total, loading, onRefresh, bookmarkCount }) {
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <div className="logo-dot" />
        <span className="logo-text" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          IE Tech<span className="logo-sub"> News</span>
        </span>
      </div>

      <div className="nav-links">
        <NavLink to="/" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')} end>
          📰 News Feed
        </NavLink>
        <NavLink to="/analytics" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          📊 Analytics
        </NavLink>
        <NavLink to="/trends" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          📈 Trends
        </NavLink>
        <NavLink to="/bookmarks" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          🔖 Bookmarks
          {bookmarkCount > 0 && (
            <span className="nav-bookmark-count">{bookmarkCount}</span>
          )}
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          ⚙️ Settings
        </NavLink>
      </div>

      <div className="navbar-right">
        {total > 0 && (
          <span className="count-badge">{total} articles</span>
        )}
       
      </div>
    </nav>
  );
}