import React, { useMemo } from 'react';
import { PlayerData, MarketAsset, Portfolio, FirmData } from '../generated/types';

const TIER_NAMES = ['Studio', 'Office', 'Trading Floor', 'Wall St. Tower'];

interface PlayerUIProps {
  playerData: PlayerData | null;
  marketAssets: MarketAsset[];
  portfolio: Portfolio[];
  firm: FirmData | null;
}

export const PlayerUI: React.FC<PlayerUIProps> = ({ playerData, marketAssets, portfolio, firm }) => {
  const portfolioValue = useMemo(() => {
    return portfolio.reduce((total, position) => {
      const asset = marketAssets.find((a) => a.ticker === position.ticker);
      return total + (asset ? asset.currentPrice * position.shares : 0);
    }, 0);
  }, [portfolio, marketAssets]);

  if (!playerData) return null;

  const netWorth = playerData.cashBalance + portfolioValue;

  return (
    <div className="finance-hud">
      <div className="finance-hud-title">{playerData.username}</div>
      <div className="finance-stat">
        <span>Cash</span>
        <strong>${playerData.cashBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
      </div>
      <div className="finance-stat">
        <span>Portfolio</span>
        <strong>${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
      </div>
      <div className="finance-stat highlight">
        <span>Net Worth</span>
        <strong>${netWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
      </div>
      <div className="finance-stat">
        <span>Firm</span>
        <strong>{TIER_NAMES[firm?.tier ?? 0]}</strong>
      </div>
      <div className="finance-stat">
        <span>AUM</span>
        <strong>${(firm?.aum ?? netWorth).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
      </div>
    </div>
  );
};
