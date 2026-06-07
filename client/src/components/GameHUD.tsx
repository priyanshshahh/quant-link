import React from 'react';
import { MarketAsset } from '../generated/types';

interface GameHUDProps {
  marketAssets: MarketAsset[];
  onOpenTerminal: () => void;
  onOpenMentor: () => void;
  nearBrokerage: boolean;
  nearMentor: boolean;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  marketAssets,
  onOpenTerminal,
  onOpenMentor,
  nearBrokerage,
  nearMentor,
}) => {
  return (
    <>
      {/* Live market strip */}
      <div className="market-ticker-strip">
        {marketAssets.length === 0 ? (
          <span className="ticker-item">Connecting to live market...</span>
        ) : (
          marketAssets.map((a) => {
            const chg = ((a.currentPrice - a.previousPrice) / a.previousPrice) * 100;
            const up = chg >= 0;
            return (
              <span key={a.ticker} className={`ticker-item ${up ? 'up' : 'down'}`}>
                {a.ticker} ${a.currentPrice.toFixed(2)} {up ? '▲' : '▼'}{Math.abs(chg).toFixed(1)}%
              </span>
            );
          })
        )}
      </div>

      {/* Quick actions — always available for demo */}
      <div className="quick-actions">
        <button className={`action-btn terminal ${nearBrokerage ? 'pulse' : ''}`} onClick={onOpenTerminal}>
          📈 Terminal <kbd>T</kbd>
        </button>
        <button className={`action-btn mentor ${nearMentor ? 'pulse' : ''}`} onClick={onOpenMentor}>
          🧠 AI Mentor <kbd>E</kbd>
        </button>
      </div>

      {/* Mini map legend */}
      <div className="world-legend">
        <div className="legend-item"><span className="dot cyan" /> North → Exchange</div>
        <div className="legend-item"><span className="dot purple" /> West → AI Mentor</div>
      </div>
    </>
  );
};
