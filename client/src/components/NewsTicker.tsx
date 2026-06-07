import React from 'react';
import { MarketNews } from '../generated/types';

interface NewsTickerProps {
  news: MarketNews[];
}

const sentimentClass = (s: number) => (s >= 3 ? 'bull' : s <= -3 ? 'bear' : 'neutral');
const sentimentArrow = (s: number) => (s >= 3 ? '▲' : s <= -3 ? '▼' : '◆');

export const NewsTicker: React.FC<NewsTickerProps> = ({ news }) => {
  const sorted = [...news].sort((a, b) => Number(b.newsId) - Number(a.newsId));
  const latest = sorted[0];

  return (
    <div className="newsticker">
      <div className="newsticker-badge">
        <span className="newsticker-ai">AI</span>
        <span className="newsticker-label">MARKET WIRE</span>
      </div>
      <div className="newsticker-scroll">
        {sorted.length === 0 ? (
          <span className="newsticker-item neutral">◆ AI market simulator online — awaiting first headline…</span>
        ) : (
          <div className="newsticker-track">
            {sorted.concat(sorted).map((n, i) => (
              <span key={`${n.newsId.toString()}-${i}`} className={`newsticker-item ${sentimentClass(n.sentiment)}`}>
                {sentimentArrow(n.sentiment)} {n.headline}
                <span className="newsticker-score">[{n.sentiment > 0 ? '+' : ''}{n.sentiment}]</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {latest && (
        <div className={`newsticker-flash ${sentimentClass(latest.sentiment)}`} key={latest.newsId.toString()} />
      )}
    </div>
  );
};
