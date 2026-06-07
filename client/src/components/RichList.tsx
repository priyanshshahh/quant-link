import React from 'react';
import { RichListEntry } from '../generated/types';
import { Identity } from 'spacetimedb';

interface RichListProps {
  entries: RichListEntry[];
  localIdentity: Identity | null;
}

const TIER_LABELS = ['Studio', 'Office', 'Trading Floor', 'Wall St. Tower'];
const RANK_BADGE = ['🥇', '🥈', '🥉', '4', '5'];

const formatMoney = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export const RichList: React.FC<RichListProps> = ({ entries, localIdentity }) => {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);

  return (
    <div className="richlist-overlay">
      <div className="richlist-header">
        <span className="richlist-title">RICH LIST</span>
        <span className="richlist-live">● LIVE</span>
      </div>
      <div className="richlist-sub">Top 5 by Net Worth</div>
      {sorted.length === 0 ? (
        <div className="richlist-empty">Awaiting market data…</div>
      ) : (
        <ol className="richlist-rows">
          {sorted.map((e) => {
            const isMe = localIdentity && e.identity.toHexString() === localIdentity.toHexString();
            return (
              <li key={e.rank} className={isMe ? 'richlist-row me' : 'richlist-row'}>
                <span className="richlist-rank">{RANK_BADGE[e.rank - 1] ?? e.rank}</span>
                <span className="richlist-name">
                  {e.firmName || e.username}
                  <span className="richlist-tier">{TIER_LABELS[e.tier] ?? `Tier ${e.tier}`}</span>
                </span>
                <span className="richlist-networth">{formatMoney(e.netWorth)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
