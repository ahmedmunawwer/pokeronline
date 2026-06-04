import React, { useState, useEffect } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import SetupFlow from './components/SetupFlow';
import GameTable from './components/GameTable';
import ConfirmDialog from './components/ConfirmDialog';

const SESSION_KEYS = {
  roomCode: 'pokeronline_roomCode',
  playerName: 'pokeronline_playerName',
  playerId: 'pokeronline_playerId',
  secondPlayerId: 'pokeronline_secondPlayerId',
  secondPlayerName: 'pokeronline_secondPlayerName',
};
const ACTIVE_SEAT_KEY = 'pokeronline_activeSeatIdx';

function saveSession(code, playerName, playerId, secondName, secondPlayerId) {
  localStorage.setItem(SESSION_KEYS.roomCode, code);
  localStorage.setItem(SESSION_KEYS.playerName, playerName);
  if (playerId) localStorage.setItem(SESSION_KEYS.playerId, playerId);
  if (secondName) localStorage.setItem(SESSION_KEYS.secondPlayerName, secondName);
  if (secondPlayerId) localStorage.setItem(SESSION_KEYS.secondPlayerId, secondPlayerId);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEYS.roomCode);
  localStorage.removeItem(SESSION_KEYS.playerName);
  localStorage.removeItem(SESSION_KEYS.playerId);
  localStorage.removeItem(SESSION_KEYS.secondPlayerId);
  localStorage.removeItem(SESSION_KEYS.secondPlayerName);
  sessionStorage.removeItem(ACTIVE_SEAT_KEY);
}

function getSavedSession() {
  return {
    roomCode: localStorage.getItem(SESSION_KEYS.roomCode),
    playerName: localStorage.getItem(SESSION_KEYS.playerName),
    playerId: localStorage.getItem(SESSION_KEYS.playerId),
    secondPlayerId: localStorage.getItem(SESSION_KEYS.secondPlayerId),
    secondPlayerName: localStorage.getItem(SESSION_KEYS.secondPlayerName),
  };
}

function hasPending(id, gs, lobbyState = null) {
  if (lobbyState?.setupPhase === 'waiting') {
    const isSecondary = id.endsWith('_2');
    const secondaryPlayer = lobbyState.players?.find(p => p.id.endsWith('_2'));
    if (secondaryPlayer) {
      if (isSecondary && !secondaryPlayer.ready) return true;
      if (!isSecondary && secondaryPlayer.ready) return true;
    }
  }
  if (!gs) return false;
  const p = gs.players?.find(pl => pl.id === id);
  if (!p || p.inactive) return false;
  if (gs.queue?.[0] !== undefined && gs.players?.[gs.queue[0]]?.id === id) return true;
  const revealPhases = ['preflop_start', 'flop_reveal', 'turn_reveal', 'river_reveal'];
  if (revealPhases.includes(gs.phase) && id === gs.players?.[gs.dealer]?.id) return true;
  if (gs.phase === 'showdown') {
    const dealerPlayerId = gs.players?.[gs.dealer]?.id;
    if (!gs.potAward && id === dealerPlayerId) return true;
    if (gs.potAward) {
      if (id !== dealerPlayerId &&
          gs.potAward.eligibleIds?.includes(id) &&
          !gs.confirmations?.includes(id)) return true;
      if (id === dealerPlayerId) {
        const totalApprovers = (gs.cp?.[gs.pi]?.eligible || [])
          .filter(p => p.id !== dealerPlayerId && !p.folded && !p.inactive).length;
        if ((gs.confirmations?.length ?? 0) >= totalApprovers) return true;
      }
    }
  }
  if (gs.phase === 'end' && gs.sn < gs.cfg?.sessions && id === gs.players?.[gs.dealer]?.id) return true;
  if (gs.phase === 'session_end' && gs.sn < gs.cfg?.sessions && id === lobbyState?.hostId) return true;
  if (gs.restartApprovals !== undefined && !gs.restartApprovals.includes(id)) return true;
  return false;
}

function App() {
  const [roomCode, setRoomCode] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [lobbyState, setLobbyState] = useState(null);
  const [hostEnded, setHostEnded] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [stallInfo, setStallInfo] = useState(null);
  const [mySeats, setMySeats] = useState([]);
  const [activeSeatIdx, setActiveSeatIdx] = useState(() => {
    const v = sessionStorage.getItem(ACTIVE_SEAT_KEY);
    return v === '1' ? 1 : 0;
  });
  const [autoSwitch, setAutoSwitch] = useState(
    () => sessionStorage.getItem('pokeronline_autoSwitch') !== '0'
  );

  useEffect(() => {
    const saved = getSavedSession();

    const handleConnect = () => {
      if (!saved.roomCode || !saved.playerName) return;
      setReconnecting(true);
      socket.emit('sync_reconnect', {
        roomCode: saved.roomCode,
        playerName: saved.playerName,
        playerId: saved.playerId,
        secondPId: saved.secondPlayerId || undefined,
        secondName: saved.secondPlayerName || undefined,
      }, (res) => {
        setReconnecting(false);
        if (res.success) {
          setRoomCode(saved.roomCode);
          const seats = [{ name: saved.playerName, pId: res.playerId || saved.playerId }];
          if (res.secondPlayerId) seats.push({ name: saved.secondPlayerName, pId: res.secondPlayerId });
          setMySeats(seats);
          if (res.playerId) saveSession(saved.roomCode, saved.playerName, res.playerId, saved.secondPlayerName, res.secondPlayerId);
          const savedIdx = sessionStorage.getItem(ACTIVE_SEAT_KEY) === '1' ? 1 : 0;
          setActiveSeatIdx(seats.length === 2 ? savedIdx : 0);
        } else {
          clearSession();
        }
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && saved.roomCode && saved.playerName && !socket.connected) {
        socket.connect();
      }
    };

    const handleGameUpdate = (newState) => setGameState(newState);
    const handleLobbyUpdate = (room) => setLobbyState(room);
    const handleRoomError = (msg) => { alert(msg); setRoomCode(null); };
    const handleHostEnded = () => setHostEnded(true);
    const handleGameStalled = (data) => setStallInfo(data);

    socket.on('connect', handleConnect);
    socket.on('game_state_update', handleGameUpdate);
    socket.on('lobby_update', handleLobbyUpdate);
    socket.on('room_error', handleRoomError);
    socket.on('game_ended_by_host', handleHostEnded);
    socket.on('game_stalled', handleGameStalled);
    document.addEventListener('visibilitychange', handleVisibility);

    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('game_state_update', handleGameUpdate);
      socket.off('lobby_update', handleLobbyUpdate);
      socket.off('room_error', handleRoomError);
      socket.off('game_ended_by_host', handleHostEnded);
      socket.off('game_stalled', handleGameStalled);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!autoSwitch || mySeats.length !== 2) return;
    if (!gameState && !lobbyState) return;
    const activeId   = activeSeatIdx === 0 ? socket.id : socket.id + '_2';
    const inactiveId = activeSeatIdx === 0 ? socket.id + '_2' : socket.id;
    if (hasPending(inactiveId, gameState, lobbyState) && !hasPending(activeId, gameState, lobbyState)) {
      const next = 1 - activeSeatIdx;
      setActiveSeatIdx(next);
      sessionStorage.setItem(ACTIVE_SEAT_KEY, String(next));
    }
  }, [autoSwitch, gameState, lobbyState, activeSeatIdx, mySeats.length]);

  // Show spinner during ALL reconnects, not just the initial load — mid-game reconnects
  // briefly invalidate local seat identification because socket.id changes the moment the
  // connection re-establishes, but gameState/lobbyState still carry the old ID until the
  // sync_reconnect round-trip completes. Rendering the game during that window breaks
  // the local player's seat, action buttons, and hand display.
  if (reconnecting) {
    return (
      <div style={{minHeight:'100vh',background:'radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:32,marginBottom:12}}>🔄</div>
          <div style={{color:'#f0c040',fontWeight:800,fontSize:16}}>Reconnecting...</div>
        </div>
      </div>
    );
  }

  if (hostEnded) {
    return (
      <div style={{minHeight:'100vh',background:'radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
        <div style={{maxWidth:400,width:'100%',background:'rgba(0,0,0,0.5)',border:'1px solid rgba(255,100,100,0.4)',borderRadius:16,padding:30,textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>🚫</div>
          <h2 style={{color:'#ff8a80',margin:'0 0 8px',fontSize:20,fontWeight:800}}>Game Ended by Host</h2>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:14,margin:'0 0 24px'}}>The host has ended the session.</p>
          <button onClick={()=>{setHostEnded(false);setRoomCode(null);setLobbyState(null);setGameState(null);clearSession();}} style={{background:'#f0c040',color:'#1a0f0a',border:'none',borderRadius:10,padding:'12px 30px',fontSize:15,fontWeight:800,cursor:'pointer',width:'100%'}}>Return to Home</button>
        </div>
      </div>
    );
  }

  if (!roomCode || !lobbyState) {
    return <Lobby onJoined={(code, playerName, playerId, secondName, secondPlayerId) => {
      setRoomCode(code);
      saveSession(code, playerName, playerId, secondName, secondPlayerId);
      const seats = [{ name: playerName, pId: playerId }];
      if (secondName && secondPlayerId) seats.push({ name: secondName, pId: secondPlayerId });
      setMySeats(seats);
      if (seats.length < 2) {
        setActiveSeatIdx(0);
        sessionStorage.removeItem(ACTIVE_SEAT_KEY);
      }
    }} />;
  }

  const emitAction = (action, amount = 0, actionObj = null) => {
    socket.emit('player_action', { action, amount, ...actionObj });
  };

  const myPlayer = lobbyState?.players?.find(p => p.id === socket.id);
  const isHost = lobbyState?.hostId === socket.id;
  const inGame = lobbyState?.setupPhase === 'in_game';

  const activeSeatId = mySeats.length > 0 ? (activeSeatIdx === 0 ? socket.id : socket.id + '_2') : null;
  const inactiveSeatId = mySeats.length === 2
    ? (activeSeatIdx === 0 ? socket.id + '_2' : socket.id)
    : null;
  const switchPulse = mySeats.length === 2 && !!inactiveSeatId &&
    hasPending(inactiveSeatId, gameState, lobbyState);

  const clearRoom = () => { setStallInfo(null); setLeaveDialog(null); setRoomCode(null); setLobbyState(null); setGameState(null); setMySeats([]); setActiveSeatIdx(0); clearSession(); };

  const handleLeaveClick = () => {
    if (inGame) {
      const gameOver = gameState &&
        (gameState.phase === 'end' || gameState.phase === 'session_end') &&
        gameState.sn >= gameState.cfg?.sessions;
      if (gameOver) {
        socket.emit('restart_leave');
        clearRoom();
      } else {
        setLeaveDialog({
          title: 'Leave game?',
          body: 'This will stall the game for all other players. They will need to restart from the Load Game menu using the ⚡ Autosave slot.',
          confirmLabel: 'Leave',
          confirmBg: '#7a1a1a',
          onConfirm: () => socket.emit('player_leave', clearRoom),
        });
      }
    } else if (isHost) {
      setLeaveDialog({
        title: 'End the room for everyone?',
        body: 'All players will be kicked out and the room will be deleted.',
        confirmLabel: 'Yes, end it',
        confirmBg: '#7a1a1a',
        onConfirm: () => socket.emit('host_end_game', { save: false }, clearRoom),
      });
    } else {
      setLeaveDialog({
        title: 'Leave the room?',
        body: "You'll return to the home screen. The room will continue without you.",
        confirmLabel: 'Yes, leave',
        confirmBg: '#7a1a1a',
        onConfirm: () => { socket.emit('leave_room'); clearRoom(); },
      });
    }
  };

  return (
    <div className="app-shell" style={{minHeight:'100vh',background:'radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)',color:'#fff',padding:'12px 14px',fontFamily:"'Segoe UI',sans-serif",boxSizing:'border-box'}}>
      <div className="app-header-bar" style={{maxWidth:460,margin:'0 auto',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,background:'rgba(0,0,0,0.4)',padding:'10px 15px',borderRadius:12,border:'1px solid rgba(240,192,64,0.3)',position:'relative',zIndex:2000}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          {myPlayer && mySeats.length < 2 && (
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{color:'rgba(255,255,255,0.35)',fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>YOU</span>
              <span style={{color:'rgba(240,192,64,0.85)',fontSize:13,fontWeight:700}}>{myPlayer.name}</span>
            </div>
          )}
          <div style={{width:1,height:16,background:'rgba(255,255,255,0.15)',display:(myPlayer && mySeats.length < 2)?'block':'none'}} />
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'rgba(255,255,255,0.6)',fontSize:13,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>Room</span>
            <span style={{color:'#f0c040',fontSize:22,fontWeight:900}}>{roomCode}</span>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {mySeats.length === 2 && (
            <>
              <span style={{color:'rgba(255,255,255,0.5)',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>Acting: <span style={{color:'#f0c040'}}>{mySeats[activeSeatIdx]?.name}</span></span>
              <button
                onClick={() => { const next = !autoSwitch; setAutoSwitch(next); sessionStorage.setItem('pokeronline_autoSwitch', next ? '1' : '0'); }}
                style={{background:autoSwitch?'rgba(240,192,64,0.25)':'rgba(255,255,255,0.06)',border:`1px solid ${autoSwitch?'rgba(240,192,64,0.6)':'rgba(255,255,255,0.18)'}`,color:autoSwitch?'#f0c040':'rgba(255,255,255,0.35)',padding:'6px 8px',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer'}}
              >Auto</button>
              <button
                className={switchPulse && !autoSwitch ? 'switch-pulse' : undefined}
                onClick={() => { const n = 1 - activeSeatIdx; setActiveSeatIdx(n); sessionStorage.setItem(ACTIVE_SEAT_KEY, String(n)); }}
                style={{background:'rgba(240,192,64,0.15)',border:'1px solid rgba(240,192,64,0.4)',color:'#f0c040',padding:'6px 10px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}
              >Switch</button>
            </>
          )}
          <button onClick={() => window.location.reload()} style={{background:'rgba(33,150,243,0.15)',border:'1px solid rgba(33,150,243,0.35)',color:'#64b5f6',padding:'6px 8px',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}>↻</button>
          <button onClick={handleLeaveClick} style={{background:'rgba(211,47,47,0.2)',border:'1px solid rgba(211,47,47,0.5)',color:'#ff8a80',padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>Leave</button>
        </div>
      </div>
      {leaveDialog && <ConfirmDialog title={leaveDialog.title} body={leaveDialog.body} confirmLabel={leaveDialog.confirmLabel} confirmBg={leaveDialog.confirmBg} onConfirm={leaveDialog.onConfirm} onCancel={() => setLeaveDialog(null)} />}

      {stallInfo && (
        <div style={{position:'fixed',inset:0,zIndex:3000,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{maxWidth:360,width:'100%',background:'linear-gradient(160deg,rgba(30,18,10,0.98) 0%,rgba(10,5,0,0.99) 100%)',border:'1px solid rgba(240,192,64,0.25)',borderRadius:16,padding:'28px 24px',textAlign:'center',boxShadow:'0 8px 40px rgba(0,0,0,0.7)'}}>
            <p style={{color:'#f0c040',fontWeight:800,fontSize:17,margin:'0 0 10px'}}>Game stalled — {stallInfo.leftBy} left</p>
            <p style={{color:'rgba(255,255,255,0.5)',fontSize:13,margin:'0 0 22px',lineHeight:1.5}}>You can restart this game from the ⚡ Autosave slot in the Load Game menu.</p>
            <button onClick={clearRoom} style={{width:'100%',padding:'11px 0',background:'#f0c040',color:'#1a0f0a',border:'none',borderRadius:10,fontWeight:800,fontSize:14,cursor:'pointer'}}>Return to Home</button>
          </div>
        </div>
      )}

      {lobbyState.setupPhase !== 'in_game' ? (
        <SetupFlow lobbyState={lobbyState} activeSeatId={activeSeatId} onLeave={() => { socket.emit('leave_room'); clearRoom(); }} />
      ) : (
        gameState ? <GameTable gameState={gameState} emitAction={emitAction} socket={socket} myId={activeSeatId} isHost={lobbyState.hostId === socket.id} onLeave={() => { socket.emit('leave_room'); clearRoom(); }} appPlayerName={myPlayer?.name} appRoomCode={roomCode} activeSeatIdx={activeSeatIdx} /> : <div style={{textAlign:'center',marginTop:50}}>Loading Game...</div>
      )}
    </div>
  );
}

export default App;
