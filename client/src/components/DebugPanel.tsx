/**
 * DebugPanel.tsx
 * 
 * Development and debugging tool that provides real-time game state information:
 * 
 * Key functionality:
 * - Displays connection status and player identity information
 * - Shows detailed local player state (position, health, animation)
 * - Lists all connected players in the multiplayer session
 * - Provides asset verification tools to check model availability
 * - Shows control reference documentation for players
 * - Supports collapsible sections to minimize screen space when not needed
 * 
 * Props:
 * - statusMessage: Current connection/game status text
 * - localPlayer: Data for the current user's player
 * - identity: The player's SpacetimeDB identity
 * - playerMap: Collection of all players in the current session
 * - expanded: Controls panel expansion state (collapsed/expanded)
 * - onToggleExpanded: Callback to toggle expansion state
 * - isPointerLocked: Indicates if mouse input is captured for game controls
 * 
 * Technical implementation:
 * - Implements collapsible UI sections for information organization
 * - Provides asset verification through fetch requests to check model availability
 * - Uses conditional rendering to display relevant information based on game state
 * - Prevents event propagation to avoid interfering with game controls
 * 
 * Related files:
 * - App.tsx: Provides game state data and manages the debug panel visibility
 * - Player.tsx: Subject of much of the debug information
 * - GameScene.tsx: Parent component that contains debug visualization tools
 */

import React, { useState } from 'react';
import { Identity } from 'spacetimedb';
// Import generated type
import { PlayerData } from '../generated/types';

interface DebugPanelProps {
  statusMessage: string;
  localPlayer: PlayerData | null;
  identity: Identity | null;
  playerMap: ReadonlyMap<string, PlayerData>; // Pass the whole map
  expanded: boolean; // Receive expansion state from parent
  onToggleExpanded: () => void; // Receive toggle function from parent
  isPointerLocked: boolean; // Receive pointer lock state from parent
}

export const DebugPanel: React.FC<DebugPanelProps> = ({ 
  statusMessage, 
  localPlayer, 
  identity, 
  playerMap,
  expanded,         // Use prop
  onToggleExpanded, // Use prop
  isPointerLocked,  // Use prop
}) => {
  const [modelCheckActive, setModelCheckActive] = useState(false);
  const [modelCheckResults, setModelCheckResults] = useState<string[]>([]);
  const [showControls, setShowControls] = useState(false);
  
  const toggleControls = () => setShowControls(!showControls);
  
  const checkModels = () => {
    setModelCheckActive(true);
    setModelCheckResults([]);
    
    const results: string[] = [];
    const modelTypes = ['wizard', 'paladin'];
    const modelPromises: Promise<Response>[] = [];
    
    // Check main model files
    modelTypes.forEach(type => {
      const mainPath = `/models/${type}/${type}.fbx`;
      modelPromises.push(
        fetch(mainPath)
          .then(response => {
            results.push(`${mainPath}: ${response.ok ? 'OK' : 'MISSING'} (${response.status})`);
            return response;
          })
          .catch(error => {
            results.push(`${mainPath}: ERROR - ${error.message}`);
            return new Response();
          })
      );
      
      // Check some animation files
      ['idle', 'walk-forward', 'attack'].forEach(anim => {
        const animPath = `/models/${type}/${type}-${anim === 'attack' && type === 'wizard' ? 'standing-1h-magic-attack-01' : anim}.fbx`;
        modelPromises.push(
          fetch(animPath)
            .then(response => {
              results.push(`${animPath}: ${response.ok ? 'OK' : 'MISSING'} (${response.status})`);
              return response;
            })
            .catch(error => {
              results.push(`${animPath}: ERROR - ${error.message}`);
              return new Response();
            })
        );
      });
    });
    
    Promise.all(modelPromises).then(() => {
      setModelCheckResults(results);
      setModelCheckActive(false);
    });
  };

  // Derive player list array inside the component
  const playerList: PlayerData[] = Array.from(playerMap.values()).sort((a, b) => 
    a.identity.toHexString().localeCompare(b.identity.toHexString())
  );

  const localPlayerDisplay = localPlayer ? `${localPlayer.username} (${localPlayer.characterClass}) (ID: ${identity?.toHexString().substring(0, 8)}) HP:${localPlayer.health}` : 'N/A';
  
  // Stop click propagation to prevent clicks inside the panel triggering game actions (like pointer lock)
  const handlePanelClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div 
      className="debug-panel" 
      onClick={handlePanelClick}
      style={{ 
      position: 'absolute', 
      top: '10px', 
      left: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      maxWidth: expanded ? '500px' : '300px',
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ margin: 0 }}>Debug Panel</h3>
        <button onClick={onToggleExpanded} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>
      
      {/* Display message when pointer is locked */} 
      {isPointerLocked && (
        <div style={{ color: '#ffcc00', fontSize: '10px', marginBottom: '5px' }}>
          (Press ESC to unlock mouse)
        </div>
      )}
      
      <div>
        <strong>Status:</strong> {statusMessage}
      </div>
      
      {expanded && (
        <>
          <div style={{ marginTop: '10px' }}>
            <strong>Identity:</strong> {identity ? identity.toHexString() : 'None'}
          </div>
          
          {localPlayer && (
            <div style={{ marginTop: '10px' }}>
              <strong>Local Player:</strong>
              <div>Username: {localPlayer.username}</div>
              <div>Character: {localPlayer.characterClass}</div>
              <div>Position: ({Math.round(localPlayer.position.x)}, {Math.round(localPlayer.position.y)}, {Math.round(localPlayer.position.z)})</div>
              <div>Health: {localPlayer.health}</div>
              <div>Current Animation: <span style={{color: '#ffcc00'}}>{localPlayer.currentAnimation || 'none'}</span></div>
            </div>
          )}
          
          <div style={{ marginTop: '10px' }}>
            <strong>Players ({playerMap.size}):</strong>
            <ul style={{ maxHeight: '200px', overflow: 'auto', padding: '0 0 0 20px' }}>
              {Array.from(playerMap.values()).map(player => (
                <li key={player.identity.toHexString()}>
                  {player.username} ({player.characterClass}) - {player.identity.toHexString().substring(0, 8)}...
                  {player.currentAnimation && <span style={{color: '#a0e0ff'}}> [{player.currentAnimation}]</span>}
                </li>
              ))}
            </ul>
          </div>
          
          <div style={{ marginTop: '10px' }}>
            <button onClick={toggleControls} style={{ marginRight: '10px', backgroundColor: showControls ? '#555' : '#4a54df', padding: '5px 10px', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
              {showControls ? 'Hide Controls' : 'Show Controls'}
            </button>
            
            <button 
              onClick={checkModels}
              disabled={modelCheckActive}
              style={{
                backgroundColor: '#4a54df',
                color: 'white',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '3px',
                cursor: modelCheckActive ? 'wait' : 'pointer'
              }}
            >
              {modelCheckActive ? 'Checking...' : 'Check Models'}
            </button>
          </div>
          
          {showControls && (
            <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: '5px' }}>
              <strong>Controls:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                <li>WASD: Movement</li>
                <li>Shift: Sprint</li>
                <li>Space: Jump</li>
                <li>Left Click: Attack</li>
                <li>Mouse: Look around</li>
                <li>Mouse Wheel: Zoom</li>
                <li>C: Toggle Camera Mode (Follow/Orbital)</li>
              </ul>
            </div>
          )}
          
          {modelCheckResults.length > 0 && (
            <div style={{ marginTop: '10px', maxHeight: '200px', overflow: 'auto' }}>
              <strong>Model Check Results:</strong>
              <ul style={{ padding: '0 0 0 20px' }}>
                {modelCheckResults.map((result, i) => (
                  <li key={i} style={{ 
                    color: result.includes('OK') ? '#4CFF78' : '#FF7B7B',
                    fontSize: '12px',
                    marginBottom: '2px'
                  }}>
                    {result}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};
