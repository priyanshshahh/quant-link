import React, { useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

const buildContextPrompt = (
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

  return `You are an elite quantitative trader mentoring a junior trader in a virtual financial metropolis.
Player: ${player.username}
Cash: $${player.cashBalance.toFixed(0)}
Knowledge Level: ${player.knowledgeLevel}/3
Portfolio: ${positions.length ? positions.join('; ') : 'empty'}
Market snapshot: ${marketAssets.slice(0, 4).map((a) => `${a.ticker}=$${a.currentPrice.toFixed(2)}`).join(', ')}
Teach concepts like diversification, volatility, beta, and Black-Scholes when relevant. Keep responses under 120 words, sharp and educational.`;
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

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    if (!apiKey) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'mentor',
          text: 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to client/.env to enable live AI mentorship. Meanwhile: diversify across uncorrelated assets and never risk more than 2% per trade.',
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const systemPrompt = buildContextPrompt(localPlayer, portfolio, marketAssets);
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: `Trader asks: ${trimmed}` },
      ]);
      const response = result.response.text();
      setMessages((prev) => [...prev, { role: 'mentor', text: response }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'mentor',
          text: `Connection error. Fallback advice: with $${localPlayer.cashBalance.toFixed(0)} cash, consider position sizing using the Kelly criterion fraction and monitor portfolio beta against the market.`,
        },
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
