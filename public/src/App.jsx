import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { NewsProvider, useNews } from './NewsContext';
import Navbar from './components/Navbar';
import NewsFeedPage   from './pages/NewsFeedPage';
import AnalyticsPage  from './pages/AnalyticsPage';
import TrendsPage     from './pages/TrendsPage';
import ArticlePage    from './pages/ArticlePage';
import BookmarksPage  from './pages/BookmarksPage';
import SettingsPage   from './pages/SettingsPage';

function AppInner() {
  const { fetchNews, refresh, total, loading, bookmarks } = useNews();

  useEffect(() => { fetchNews(); }, []); // eslint-disable-line

  return (
    <>
      <Navbar
        total={total}
        loading={loading}
        onRefresh={refresh}
        bookmarkCount={bookmarks.length}
      />
      <Routes>
        <Route path="/"            element={<NewsFeedPage />} />
        <Route path="/analytics"   element={<AnalyticsPage />} />
        <Route path="/trends"      element={<TrendsPage />} />
        <Route path="/article/:id" element={<ArticlePage />} />
        <Route path="/bookmarks"   element={<BookmarksPage />} />
        <Route path="/settings"    element={<SettingsPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NewsProvider>
        <AppInner />
      </NewsProvider>
    </BrowserRouter>
  );
}