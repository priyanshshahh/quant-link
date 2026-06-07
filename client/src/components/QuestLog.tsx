import React, { useMemo, useState } from 'react';
import { DbConnection } from '../generated';
import { PlayerData, MarketAsset, Portfolio, Employee, OwnedProperty, FirmData } from '../generated/types';

interface QuestLogProps {
  conn: DbConnection;
  localPlayer: PlayerData;
  marketAssets: MarketAsset[];
  portfolio: Portfolio[];
  employees: Employee[];
  ownedProperties: OwnedProperty[];
  ownedVehicleCount: number;
  firm: FirmData | null;
  claimedKeys: Set<string>;
  onClose: () => void;
}

interface QuestDef {
  key: string;
  title: string;
  desc: string;
  reward: number;
  current: number;
  target: number;
  fmt?: (n: number) => string;
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export const QuestLog: React.FC<QuestLogProps> = ({
  conn,
  localPlayer,
  marketAssets,
  portfolio,
  employees,
  ownedProperties,
  ownedVehicleCount,
  firm,
  claimedKeys,
  onClose,
}) => {
  const [busy, setBusy] = useState<string | null>(null);

  const netWorth = useMemo(() => {
    const priceOf = (ticker: string) =>
      marketAssets.find((a) => a.ticker === ticker)?.currentPrice ?? 0;
    const portfolioValue = portfolio.reduce((sum, p) => sum + p.shares * priceOf(p.ticker), 0);
    return localPlayer.cashBalance + portfolioValue;
  }, [marketAssets, portfolio, localPlayer.cashBalance]);

  const distinctTickers = useMemo(
    () => new Set(portfolio.map((p) => p.ticker)).size,
    [portfolio]
  );

  const quests: QuestDef[] = [
    { key: 'first_trade', title: 'First Blood', desc: 'Open your first position on the market', reward: 5_000, current: portfolio.length, target: 1 },
    { key: 'diversify', title: 'Diversify', desc: 'Hold 3 different tickers at once', reward: 15_000, current: distinctTickers, target: 3 },
    { key: 'six_figures', title: 'Six Figures', desc: 'Reach $150K net worth', reward: 10_000, current: netWorth, target: 150_000, fmt: money },
    { key: 'knowledge', title: 'Back to School', desc: 'Upgrade your trading knowledge once', reward: 5_000, current: localPlayer.knowledgeLevel, target: 1 },
    { key: 'first_hire', title: 'Build a Desk', desc: 'Hire your first employee', reward: 8_000, current: employees.length, target: 1 },
    { key: 'first_car', title: 'Flex', desc: 'Buy your first vehicle', reward: 10_000, current: ownedVehicleCount, target: 1 },
    { key: 'property_mogul', title: 'Property Mogul', desc: 'Acquire a piece of real estate', reward: 20_000, current: ownedProperties.length, target: 1 },
    { key: 'team_builder', title: 'Team Builder', desc: 'Grow your team to 3 employees', reward: 25_000, current: employees.length, target: 3 },
    { key: 'firm_upgrade', title: 'Moving Up', desc: 'Upgrade your firm to the next tier', reward: 30_000, current: firm?.tier ?? 0, target: 1 },
    { key: 'whale', title: 'Whale', desc: 'Reach $1,000,000 net worth', reward: 100_000, current: netWorth, target: 1_000_000, fmt: money },
  ];

  const claim = (key: string) => {
    setBusy(key);
    conn.reducers.claimQuestReward({ questKey: key });
    setTimeout(() => setBusy(null), 1200);
  };

  const completedCount = quests.filter((q) => claimedKeys.has(q.key)).length;

  return (
    <div className="questlog-overlay" onClick={onClose}>
      <div className="questlog-panel" onClick={(e) => e.stopPropagation()}>
        <div className="questlog-header">
          <div>
            <h2>🎯 Career Objectives</h2>
            <span className="questlog-sub">{completedCount}/{quests.length} completed · climb from intern to titan</span>
          </div>
          <button className="questlog-close" onClick={onClose}>✕</button>
        </div>

        <div className="questlog-list">
          {quests.map((q) => {
            const claimed = claimedKeys.has(q.key);
            const ready = q.current >= q.target && !claimed;
            const pct = Math.min(100, (q.current / q.target) * 100);
            const fmt = q.fmt ?? ((n: number) => `${Math.floor(n)}`);
            return (
              <div key={q.key} className={`quest-card ${claimed ? 'done' : ready ? 'ready' : ''}`}>
                <div className="quest-info">
                  <div className="quest-title-row">
                    <span className="quest-title">{q.title}</span>
                    <span className="quest-reward">+{money(q.reward)}</span>
                  </div>
                  <div className="quest-desc">{q.desc}</div>
                  <div className="quest-bar">
                    <div className="quest-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="quest-progress">{fmt(q.current)} / {fmt(q.target)}</div>
                </div>
                <div className="quest-action">
                  {claimed ? (
                    <span className="quest-claimed">✓ CLAIMED</span>
                  ) : ready ? (
                    <button
                      className="quest-claim-btn"
                      disabled={busy === q.key}
                      onClick={() => claim(q.key)}
                    >
                      {busy === q.key ? '…' : 'CLAIM'}
                    </button>
                  ) : (
                    <span className="quest-locked">IN PROGRESS</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
