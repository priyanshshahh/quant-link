import React, { useState } from 'react';

interface JoinGameDialogProps {
  onJoin: (username: string, characterClass: string) => void;
}

export const JoinGameDialog: React.FC<JoinGameDialogProps> = ({ onJoin }) => {
  const [username, setUsername] = useState('QuantTrader');
  const [characterClass, setCharacterClass] = useState('Analyst');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const finalUsername = username.trim() || `Trader${Math.floor(Math.random() * 1000)}`;
    onJoin(finalUsername, characterClass);
  };

  return (
    <div style={styles.overlay}>
      <form style={styles.dialog} onSubmit={handleSubmit}>
        <h2>QuantLife</h2>
        <p style={styles.tagline}>GTA-style finance sim. Build your firm. Beat the market.</p>
        <div style={styles.inputGroup}>
          <label htmlFor="username" style={styles.label}>Trader Name:</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={16}
            style={styles.input}
          />
        </div>
        <div style={styles.inputGroup}>
          <label htmlFor="characterClass" style={styles.label}>Specialization:</label>
          <select
            id="characterClass"
            value={characterClass}
            onChange={(e) => setCharacterClass(e.target.value)}
            style={styles.select}
          >
            <option value="Analyst">Equity Analyst</option>
            <option value="Quant">Quant Researcher</option>
            <option value="Trader">Day Trader</option>
          </select>
        </div>
        <p style={styles.hint}>Starting capital: $100,000</p>
        <button type="submit" style={styles.button}>Enter the Market</button>
      </form>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  dialog: {
    background: 'linear-gradient(135deg, rgba(20,30,50,0.95), rgba(10,20,40,0.98))',
    padding: '36px',
    borderRadius: '16px',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    boxShadow: '0 8px 32px rgba(0, 212, 255, 0.15)',
    color: '#eee',
    width: '380px',
    textAlign: 'center',
  },
  tagline: {
    color: '#00d4ff',
    fontSize: '14px',
    marginBottom: '24px',
  },
  inputGroup: {
    marginBottom: '20px',
    textAlign: 'left',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    color: '#aaa',
    fontSize: '14px',
  },
  input: {
    width: 'calc(100% - 20px)',
    padding: '10px',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.4)',
    color: '#eee',
    fontSize: '16px',
  },
  select: {
    width: '100%',
    padding: '10px',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    borderRadius: '8px',
    backgroundColor: 'rgba(0,0,0,0.4)',
    color: '#eee',
    fontSize: '16px',
  },
  hint: {
    fontSize: '13px',
    color: '#888',
    marginBottom: '16px',
  },
  button: {
    padding: '14px 28px',
    border: 'none',
    borderRadius: '8px',
    background: 'linear-gradient(90deg, #0066cc, #00d4ff)',
    color: 'white',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
};
