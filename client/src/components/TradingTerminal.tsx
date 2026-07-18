import React, { useMemo, useState } from 'react';
import { DbConnection } from '../generated';
import {
  MarketAsset, Portfolio, PlayerData, VehicleCatalog,
  FirmData, Employee, PropertyCatalog, OwnedProperty, RestingOrder,
} from '../generated/types';
import { parseRemixPrompt } from '../services/AI_Market_Events';
import gameConstants from '../gameConstants.json';

// Firm-tier display data from the shared single source of truth
// (gameConstants.json, mirrored + drift-tested against the Rust server).
const TIER_NAMES = gameConstants.firmTiers.map((t) => t.name);
const TIER_REQS = gameConstants.firmTiers.map((t) => t.netWorthReq);
const TIER_COSTS = gameConstants.firmTiers.map((t) => t.upgradeCost);

interface TradingTerminalProps {
  conn: DbConnection;
  localPlayer: PlayerData;
  marketAssets: MarketAsset[];
  portfolio: Portfolio[];
  restingOrders: RestingOrder[];
  vehicleCatalog: VehicleCatalog[];
  firm: FirmData | null;
  employees: Employee[];
  propertyCatalog: PropertyCatalog[];
  ownedProperties: OwnedProperty[];
  onClose: () => void;
}

export const TradingTerminal: React.FC<TradingTerminalProps> = ({
  conn, localPlayer, marketAssets, portfolio, restingOrders, vehicleCatalog,
  firm, employees, propertyCatalog, ownedProperties, onClose,
}) => {
  const [selectedTicker, setSelectedTicker] = useState(marketAssets[0]?.ticker ?? 'AAPL');
  const [shares, setShares] = useState('10');
  const [tradeMessage, setTradeMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'market' | 'firm' | 'life'>('market');
  const [remixPrompt, setRemixPrompt] = useState('');
  const [remixBusy, setRemixBusy] = useState(false);
  // Resting order form
  const [orderKind, setOrderKind] = useState<'limit' | 'stop'>('limit');
  const [orderTrigger, setOrderTrigger] = useState('');

  const REMIX_EXAMPLES = [
    'Retail-driven short squeeze on tech stocks',
    'Global supply chain crisis spikes volatility',
    'Bitcoin ETF approval sparks a crypto rally',
    'SEC fraud probe craters the banks',
  ];

  const handleRemix = async (raw?: string) => {
    const prompt = (raw ?? remixPrompt).trim();
    if (!prompt || remixBusy) return;
    setRemixBusy(true);
    setTradeMessage('🧠 AI is remixing the market…');
    try {
      const p = await parseRemixPrompt(prompt);
      conn.reducers.remixMarket({
        ticker: p.ticker,
        driftModifier: p.driftModifier,
        volatilityModifier: p.volatilityModifier,
        headline: p.headline,
      });
      const dir = p.driftModifier > 0 ? 'bullish' : p.driftModifier < 0 ? 'bearish' : 'neutral';
      setTradeMessage(`✨ Remix applied → ${p.ticker} ${dir} (drift ${p.driftModifier >= 0 ? '+' : ''}${(p.driftModifier * 100).toFixed(0)}%, vol +${(p.volatilityModifier * 100).toFixed(0)}%)`);
      setRemixPrompt('');
    } catch (err) {
      setTradeMessage('Remix failed — try a different prompt.');
    } finally {
      setRemixBusy(false);
    }
  };

  const portfolioValue = useMemo(() => portfolio.reduce((total, position) => {
    const asset = marketAssets.find((a) => a.ticker === position.ticker);
    return total + (asset ? asset.currentPrice * position.shares : 0);
  }, 0), [portfolio, marketAssets]);

  const netWorth = localPlayer.cashBalance + portfolioValue;
  const tier = firm?.tier ?? 0;

  const handleTrade = (isBuy: boolean) => {
    const qty = parseFloat(shares);
    if (!qty || qty <= 0) { setTradeMessage('Enter a valid share quantity.'); return; }
    conn.reducers.executeTrade({ ticker: selectedTicker, shares: qty, isBuy });
    setTradeMessage(`${isBuy ? 'Buy' : 'Sell'} order sent for ${qty} ${selectedTicker}`);
  };

  const handlePlaceOrder = (isBuy: boolean) => {
    const qty = parseFloat(shares);
    const trigger = parseFloat(orderTrigger);
    if (!qty || qty <= 0) { setTradeMessage('Enter a valid share quantity.'); return; }
    if (!trigger || trigger <= 0) { setTradeMessage('Enter a valid trigger price.'); return; }
    conn.reducers.placeOrder({
      ticker: selectedTicker,
      isBuy,
      isStop: orderKind === 'stop',
      shares: qty,
      triggerPrice: trigger,
    });
    setTradeMessage(`${orderKind === 'stop' ? 'Stop' : 'Limit'} ${isBuy ? 'buy' : 'sell'} placed: ${qty} ${selectedTicker} @ $${trigger.toFixed(2)}`);
    setOrderTrigger('');
  };

  const handleCancelOrder = (orderId: bigint) => {
    conn.reducers.cancelOrder({ orderId });
    setTradeMessage('Order cancelled.');
  };

  const handleHire = (role: string) => {
    conn.reducers.hireEmployee({ role });
    setTradeMessage(`Hiring ${role}...`);
  };

  const handleBuyProperty = (key: string) => {
    conn.reducers.buyProperty({ propertyKey: key });
    setTradeMessage(`Purchasing property...`);
  };

  const handleUpgradeFirm = () => {
    conn.reducers.upgradeFirm({});
    setTradeMessage('Upgrading firm...');
  };

  return (
    <div className="terminal-overlay">
      <div className="terminal-panel terminal-wide">
        <div className="terminal-header">
          <div>
            <h2>{firm?.firmName ?? localPlayer.username} Capital</h2>
            <p className="terminal-subtitle">
              {TIER_NAMES[tier]} · AUM ${(firm?.aum ?? netWorth).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <button className="terminal-close" onClick={onClose}>✕</button>
        </div>

        <div className="terminal-stats">
          <div className="stat-card"><span>Cash</span><strong>${localPlayer.cashBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
          <div className="stat-card"><span>Portfolio</span><strong>${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
          <div className="stat-card"><span>Reputation</span><strong>{(firm?.reputation ?? 50).toFixed(0)}%</strong></div>
          <div className="stat-card"><span>Reg. Risk</span><strong className={firm && firm.regulatoryRisk > 50 ? 'price-down' : ''}>{(firm?.regulatoryRisk ?? 10).toFixed(0)}%</strong></div>
        </div>

        <div className="terminal-tabs">
          {(['market', 'firm', 'life'] as const).map((tab) => (
            <button key={tab} className={activeTab === tab ? 'tab active' : 'tab'} onClick={() => setActiveTab(tab)}>
              {tab === 'market' ? '📈 Market' : tab === 'firm' ? '🏢 Firm' : '🌴 Life'}
            </button>
          ))}
        </div>

        {activeTab === 'market' && (
          <div className="terminal-content">
            <div className="remix-box">
              <div className="remix-head">
                <span className="remix-title">🧠 AI WORLD REMIX</span>
                <span className="remix-sub">Type a prompt — the AI rewrites the live market for everyone</span>
              </div>
              <div className="remix-input-row">
                <input
                  value={remixPrompt}
                  onChange={(e) => setRemixPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRemix()}
                  placeholder="e.g. Cause a retail-driven short squeeze on tech stocks"
                  disabled={remixBusy}
                />
                <button className="remix-btn" onClick={() => handleRemix()} disabled={remixBusy || !remixPrompt.trim()}>
                  {remixBusy ? 'Remixing…' : 'Remix'}
                </button>
              </div>
              <div className="remix-chips">
                {REMIX_EXAMPLES.map((ex) => (
                  <button key={ex} className="remix-chip" onClick={() => handleRemix(ex)} disabled={remixBusy}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
            <table className="market-table">
              <thead><tr><th>Ticker</th><th>Price</th><th>Change</th><th>Vol</th></tr></thead>
              <tbody>
                {marketAssets.map((asset) => {
                  const change = ((asset.currentPrice - asset.previousPrice) / asset.previousPrice) * 100;
                  const isUp = change >= 0;
                  return (
                    <tr key={asset.ticker} className={selectedTicker === asset.ticker ? 'selected-row' : ''} onClick={() => setSelectedTicker(asset.ticker)}>
                      <td><strong>{asset.ticker}</strong><div className="company-name">{asset.companyName}</div></td>
                      <td>${asset.currentPrice.toFixed(2)}</td>
                      <td className={isUp ? 'price-up' : 'price-down'}>{isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</td>
                      <td>{(asset.volatility * 100).toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="trade-controls">
              <select value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)}>
                {marketAssets.map((a) => <option key={a.ticker} value={a.ticker}>{a.ticker}</option>)}
              </select>
              <input type="number" min="1" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="Shares" />
              <button className="buy-btn" onClick={() => handleTrade(true)}>Buy</button>
              <button className="sell-btn" onClick={() => handleTrade(false)}>Sell</button>
            </div>

            {/* ---- Resting limit / stop orders ---- */}
            <div className="orders-box">
              <div className="orders-head">
                <span className="orders-title">Limit &amp; Stop Orders</span>
                <span className="orders-hint">Fills against the simulated price on a future tick</span>
              </div>
              <div className="order-form">
                <select value={orderKind} onChange={(e) => setOrderKind(e.target.value as 'limit' | 'stop')}>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderTrigger}
                  onChange={(e) => setOrderTrigger(e.target.value)}
                  placeholder="Trigger $"
                />
                <button className="buy-btn" onClick={() => handlePlaceOrder(true)}>Buy {orderKind}</button>
                <button className="sell-btn" onClick={() => handlePlaceOrder(false)}>Sell {orderKind}</button>
              </div>
              {restingOrders.length > 0 && (
                <ul className="orders-list">
                  {restingOrders.map((o) => (
                    <li key={o.orderId.toString()} className="order-row">
                      <span className={o.isBuy ? 'order-buy' : 'order-sell'}>
                        {o.isBuy ? 'BUY' : 'SELL'} {o.isStop ? 'STOP' : 'LIMIT'}
                      </span>
                      <span>{o.shares} {o.ticker} @ ${o.triggerPrice.toFixed(2)}</span>
                      <button className="order-cancel" onClick={() => handleCancelOrder(o.orderId)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'firm' && (
          <div className="terminal-content">
            <div className="firm-header">
              <div>
                <h3>Build Your Firm</h3>
                <p className="firm-desc">Like Market Hours — hire staff, scale AUM, dominate Wall Street.</p>
              </div>
              {tier < 3 && (
                <button className="upgrade-btn" onClick={handleUpgradeFirm} disabled={netWorth < TIER_REQS[tier + 1]}>
                  Upgrade to {TIER_NAMES[tier + 1]} (${TIER_COSTS[tier + 1].toLocaleString()})
                </button>
              )}
            </div>

            <h4 className="section-title">Hire Team ({employees.length}/{8 + tier * 4})</h4>
            <div className="hire-grid">
              {[
                { role: 'trader', label: 'Trader', desc: 'Generates alpha on your portfolio', cost: 800 },
                { role: 'researcher', label: 'Researcher', desc: 'Boosts reputation & alpha', cost: 650 },
                { role: 'compliance', label: 'Compliance', desc: 'Reduces regulatory risk', cost: 550 },
                { role: 'engineer', label: 'Engineer', desc: 'Latency edge & passive income', cost: 900 },
              ].map((r) => (
                <div key={r.role} className="hire-card">
                  <h4>{r.label}</h4>
                  <p>{r.desc}</p>
                  <p className="hire-cost">${r.cost} signing bonus</p>
                  <button onClick={() => handleHire(r.role)} disabled={localPlayer.cashBalance < r.cost}>Hire</button>
                </div>
              ))}
            </div>

            {employees.length > 0 && (
              <>
                <h4 className="section-title">Your Team</h4>
                <table className="market-table">
                  <thead><tr><th>Name</th><th>Role</th><th>Salary/tick</th><th>Alpha</th></tr></thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.employeeId.toString()}>
                        <td>{e.name}</td>
                        <td>{e.role}</td>
                        <td>${e.salaryPerTick.toFixed(0)}</td>
                        <td className="price-up">+{(e.alphaBonus * 100).toFixed(3)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {activeTab === 'life' && (
          <div className="terminal-content">
            <h4 className="section-title">🏠 Real Estate (GTA Lifestyle)</h4>
            <div className="lifestyle-grid">
              {propertyCatalog.filter((p) => p.price > 0).map((prop) => {
                const owned = ownedProperties.some((o) => o.propertyKey === prop.propertyKey);
                return (
                  <div key={prop.propertyKey} className="vehicle-card">
                    <h4>{prop.displayName}</h4>
                    <p className="prop-type">{prop.propertyType} · Tier {prop.firmTierRequired}+</p>
                    <p>${prop.price.toLocaleString()}</p>
                    <p className="hire-cost">+${prop.rentPerTick}/tick income</p>
                    <button
                      disabled={owned || localPlayer.cashBalance < prop.price || tier < prop.firmTierRequired}
                      onClick={() => handleBuyProperty(prop.propertyKey)}
                    >
                      {owned ? 'Owned' : 'Purchase'}
                    </button>
                  </div>
                );
              })}
            </div>

            <h4 className="section-title">🚗 Vehicles</h4>
            <div className="lifestyle-grid">
              {vehicleCatalog.map((vehicle) => (
                <div key={vehicle.vehicleKey} className="vehicle-card">
                  <h4>{vehicle.displayName}</h4>
                  <p>${vehicle.price.toLocaleString()}</p>
                  <button disabled={localPlayer.cashBalance < vehicle.price} onClick={() => conn.reducers.buyVehicle({ vehicleKey: vehicle.vehicleKey })}>
                    Purchase
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tradeMessage && <p className="trade-message">{tradeMessage}</p>}
      </div>
    </div>
  );
};
