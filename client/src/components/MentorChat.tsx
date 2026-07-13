import React, { useState } from 'react';
import { MarketAsset, PlayerData, Portfolio } from '../generated/types';

interface MentorChatProps {
  localPlayer: PlayerData;
  portfolio: Portfolio[];
  marketAssets: MarketAsset[];
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'mentor';
  text: string;
}

/**
 * Serializes the player's live game state for the server-side mentor proxy
 * (/api/mentor). Only public game data is sent — the Gemini API key lives
 * exclusively in the serverless function's environment.
 */
const buildContext = (
  player: PlayerData,
  portfolio: Portfolio[],
  marketAssets: MarketAsset[],
) => {
  const positions = portfolio.map((p) => {
    const asset = marketAssets.find((a) => a.ticker === p.ticker);
    const price = asset?.currentPrice ?? p.averageEntryPrice;
    const pnl = ((price - p.averageEntryPrice) / p.averageEntryPrice) * 100;
    return `${p.shares.toFixed(1)} shares of ${p.ticker} @ $${price.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%)`;
  });

  return `Player: ${player.username}
Cash: $${player.cashBalance.toFixed(0)}
Knowledge Level: ${player.knowledgeLevel}/3
Portfolio: ${positions.length ? positions.join('; ') : 'empty'}
Market snapshot: ${marketAssets.slice(0, 4).map((a) => `${a.ticker}=$${a.currentPrice.toFixed(2)}`).join(', ')}`;
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
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'mentor',
      text: 'Welcome to QuantLink. I am your Senior Quant mentor. Ask me about your portfolio, risk management, or any market move you do not understand.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

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
          context: buildContext(localPlayer, portfolio, marketAssets),
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
            <p className="terminal-subtitle">Powered by Gemini</p>
          </div>
          <button className="terminal-close" onClick={onClose}>✕</button>
        </div>

        <div className="mentor-messages">
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
