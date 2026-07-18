import React, { useState } from 'react';
import { MarketAsset, PlayerData, Portfolio, FirmData } from '../generated/types';
import { useEscapeClose } from '../useEscapeClose';

interface MentorChatProps {
  localPlayer: PlayerData;
  portfolio: Portfolio[];
  marketAssets: MarketAsset[];
  firm: FirmData | null;
  regime: number; // sim_math::Regime as u8
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'mentor';
  text: string;
}

const REGIME_LABELS = ['calm', 'volatile', 'crisis'];

/**
 * Serializes a live SNAPSHOT of the player's game state for the server-side
 * mentor proxy (/api/mentor), so advice is grounded in their actual holdings,
 * cash, P&L and concentration rather than being generic. Only public game data
 * is sent — the Gemini API key lives exclusively in the serverless function.
 */
const buildContext = (
  player: PlayerData,
  portfolio: Portfolio[],
  marketAssets: MarketAsset[],
  firm: FirmData | null,
  regime: number,
) => {
  const priceOf = (ticker: string) =>
    marketAssets.find((a) => a.ticker === ticker)?.currentPrice;

  let portfolioValue = 0;
  let costBasis = 0;
  let topPositionValue = 0;

  const positions = portfolio.map((p) => {
    const price = priceOf(p.ticker) ?? p.averageEntryPrice;
    const marketValue = price * p.shares;
    portfolioValue += marketValue;
    costBasis += p.averageEntryPrice * p.shares;
    if (marketValue > topPositionValue) topPositionValue = marketValue;
    const pnl = ((price - p.averageEntryPrice) / p.averageEntryPrice) * 100;
    return `${p.shares.toFixed(1)} ${p.ticker} @ $${price.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%)`;
  });

  const netWorth = player.cashBalance + portfolioValue;
  const totalPnl = costBasis > 0 ? ((portfolioValue - costBasis) / costBasis) * 100 : 0;
  const concentration = portfolioValue > 0 ? (topPositionValue / portfolioValue) * 100 : 0;
  const regimeLabel = REGIME_LABELS[regime] ?? 'calm';

  return `Player: ${player.username}
Cash: $${player.cashBalance.toFixed(0)}
Portfolio value: $${portfolioValue.toFixed(0)} across ${positions.length} position(s)
Net worth: $${netWorth.toFixed(0)}
Unrealized P&L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%
Largest position concentration: ${concentration.toFixed(0)}% of portfolio
Knowledge Level: ${player.knowledgeLevel}/3
Firm: ${firm ? `${firm.firmName} (tier ${firm.tier}, reputation ${firm.reputation.toFixed(0)}%)` : 'none'}
Market regime: ${regimeLabel}
Positions: ${positions.length ? positions.join('; ') : 'empty'}
Market snapshot: ${marketAssets.slice(0, 6).map((a) => `${a.ticker}=$${a.currentPrice.toFixed(2)}`).join(', ')}`;
};

/** Offline heuristic advice so the mentor still helps in keyless/local dev. */
const offlineAdvice = (player: PlayerData, portfolio: Portfolio[]) => {
  if (portfolio.length === 0) {
    return `Mentor AI is offline here, so classic advice: with $${player.cashBalance.toFixed(0)} cash, start small — spread your first trades across 3+ uncorrelated tickers and never risk more than 2% of your bankroll on one position.`;
  }
  if (portfolio.length < 3) {
    return 'Mentor AI is offline here. You are concentrated in few names — diversification is the only free lunch in finance. Add uncorrelated assets to cut portfolio variance without giving up expected return.';
  }
  return 'Mentor AI is offline here. Solid diversification — now watch volatility: size positions inversely to each asset\'s vol, and rebalance after big moves to keep risk contributions even.';
};

export const MentorChat: React.FC<MentorChatProps> = ({
  localPlayer,
  portfolio,
  marketAssets,
  firm,
  regime,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'mentor',
      text: 'Welcome to QuantLink. I am your Senior Quant mentor — I can see a live snapshot of your holdings, cash and P&L, so ask me about your actual positions, concentration risk, or any market move you do not understand.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  useEscapeClose(onClose);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          context: buildContext(localPlayer, portfolio, marketAssets, firm, regime),
        }),
      });

      if (res.status === 429) {
        setMessages((prev) => [
          ...prev,
          { role: 'mentor', text: 'Easy, trader — you are asking faster than I can think. Give me a minute.' },
        ]);
        return;
      }

      if (!res.ok) throw new Error(`mentor proxy ${res.status}`);

      const data = (await res.json()) as { reply?: string };
      if (!data.reply) throw new Error('empty reply');
      setMessages((prev) => [...prev, { role: 'mentor', text: data.reply! }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'mentor', text: offlineAdvice(localPlayer, portfolio) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mentor-overlay">
      <div className="mentor-panel">
        <div className="terminal-header">
          <div>
            <h2>Senior Quant Mentor</h2>
            <p className="terminal-subtitle">Powered by Gemini · sees a live snapshot of your holdings, cash &amp; P&amp;L</p>
          </div>
          <button className="terminal-close" onClick={onClose} aria-label="Close mentor">✕</button>
        </div>

        <div className="mentor-messages" aria-live="polite">
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'chat-bubble user' : 'chat-bubble mentor'}>
              {msg.text}
            </div>
          ))}
          {loading && <div className="chat-bubble mentor">Analyzing your portfolio...</div>}
        </div>

        <div className="mentor-input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about diversification, volatility, options..."
          />
          <button onClick={sendMessage} disabled={loading}>Send</button>
        </div>
      </div>
    </div>
  );
};
