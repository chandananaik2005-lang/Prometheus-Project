import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getCatClass, formatDate } from '../utils';

export default function NewsCard({ article }) {
  const navigate = useNavigate();

  return (
    <div className="card" onClick={() => navigate(`/article/${article.id}`)}>
      {article.image && (
        <img
          className="card-img"
          src={article.image}
          alt=""
          loading="lazy"
          onError={e => (e.target.style.display = 'none')}
        />
      )}
      <div className="card-top">
        <div className="card-title">{article.title}</div>
        <span className={`cat-badge ${getCatClass(article.category)}`}>{article.category}</span>
      </div>
      <div className="card-desc">{article.description}</div>
      <div className="card-footer">
        <div>
          <div className="card-date">{formatDate(article.pubDate)}</div>
          <div className="card-source">{article.source}</div>
        </div>
        <span className="read-lnk">Read →</span>
      </div>
    </div>
  );
}
