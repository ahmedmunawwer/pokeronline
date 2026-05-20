import React, { useState, useEffect } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import SetupFlow from './components/SetupFlow';
import GameTable from './components/GameTable';
import ConfirmDialog from './components/ConfirmDialog';

function App() {
    const [roomCode, setRoomCode] = useState(null);
    const [gameState, setGameState] = useState(null);
    const [lobbyState, setLobbyState] = useState(null);
    const [hostEnded, setHostEnded] = useState(false);
    const [leaveDialog, setLeaveDialog] = useState(null);

    useEffect(() => {
        socket.on('game_state_update', (newState) => {
            setGameState(newState);
        });

        socket.on('lobby_update', (room) => {
            setLobbyState(room);
        });
        
        socket.on('room_error', (msg) => {
            alert(msg);
            setRoomCode(null);
        });

        socket.on('game_ended_by_host', () => {
            setHostEnded(true);
        });

        return () => {
            socket.off('game_state_update');
            socket.off('lobby_update');
            socket.off('room_error');
            socket.off('game_ended_by_host');
        };
    }, []);

    if (hostEnded) {
        return (
            <div style={{minHeight:"100vh",background:"radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                <div style={{maxWidth:400,width:"100%",background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,100,100,0.4)",borderRadius:16,padding:30,textAlign:"center"}}>
                    <div style={{fontSize:48,marginBottom:12}}>🚫</div>
                    <h2 style={{color:"#ff8a80",margin:"0 0 8px",fontSize:20,fontWeight:800}}>Game Ended by Host</h2>
                    <p style={{color:"rgba(255,255,255,0.5)",fontSize:14,margin:"0 0 24px"}}>The host has ended the session.</p>
                    <button onClick={()=>{setHostEnded(false);setRoomCode(null);setLobbyState(null);setGameState(null);}} style={{background:"#f0c040",color:"#1a0f0a",border:"none",borderRadius:10,padding:"12px 30px",fontSize:15,fontWeight:800,cursor:"pointer",width:"100%"}}>Return to Home</button>
                </div>
            </div>
        );
    }

    if (!roomCode || !lobbyState) {
        return <Lobby onJoined={(code) => setRoomCode(code)} />;
    }

    const emitAction = (action, amount = 0, actionObj = null) => {
        socket.emit('player_action', { action, amount, ...actionObj });
    };

    const myPlayer = lobbyState?.players?.find(p => p.id === socket.id);
    const isHost = lobbyState?.hostId === socket.id;
    const inGame = lobbyState?.setupPhase === 'in_game';

    const clearRoom = () => { setLeaveDialog(null); setRoomCode(null); setLobbyState(null); setGameState(null); };

    const handleLeaveClick = () => {
        if (isHost) {
            setLeaveDialog({
                title: "End the room for everyone?",
                body: "All players will be kicked out and the room will be deleted.",
                confirmLabel: "Yes, end it",
                confirmBg: "#7a1a1a",
                onConfirm: () => socket.emit('host_end_game', { save: false }, clearRoom),
            });
        } else if (inGame) {
            setLeaveDialog({
                title: "Leave the game?",
                body: "You'll be marked inactive for the rest of this session and any following sessions in this room. Your remaining chips stay on the table.",
                confirmLabel: "Yes, leave",
                confirmBg: "#7a1a1a",
                onConfirm: () => socket.emit('player_leave_game', (res) => { if (res.success) clearRoom(); }),
            });
        } else {
            setLeaveDialog({
                title: "Leave the room?",
                body: "You'll return to the home screen. The room will continue without you.",
                confirmLabel: "Yes, leave",
                confirmBg: "#7a1a1a",
                onConfirm: () => { socket.emit('leave_room'); clearRoom(); },
            });
        }
    };

    return (
        <div className="app-shell" style={{minHeight:"100vh",background:"radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)",color:"#fff",padding:"12px 14px",fontFamily:"'Segoe UI',sans-serif",boxSizing:"border-box"}}>
            <div className="app-header-bar" style={{maxWidth: 460, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, background: "rgba(0,0,0,0.4)", padding: "10px 15px", borderRadius: 12, border: "1px solid rgba(240,192,64,0.3)"}}>
                <div style={{display: "flex", alignItems: "center", gap: 14}}>
                    {myPlayer && (
                        <div style={{display: "flex", alignItems: "center", gap: 5}}>
                            <span style={{color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase"}}>YOU</span>
                            <span style={{color: "rgba(240,192,64,0.85)", fontSize: 13, fontWeight: 700}}>{myPlayer.name}</span>
                        </div>
                    )}
                    <div style={{width: 1, height: 16, background: "rgba(255,255,255,0.15)", display: myPlayer ? "block" : "none"}} />
                    <div style={{display: "flex", alignItems: "center", gap: 8}}>
                        <span style={{color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase"}}>Room</span>
                        <span style={{color: "#f0c040", fontSize: 22, fontWeight: 900}}>{roomCode}</span>
                    </div>
                </div>
                <button onClick={handleLeaveClick} style={{background: "rgba(211,47,47,0.2)", border: "1px solid rgba(211,47,47,0.5)", color: "#ff8a80", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer"}}>Leave</button>
            </div>
            {leaveDialog && <ConfirmDialog title={leaveDialog.title} body={leaveDialog.body} confirmLabel={leaveDialog.confirmLabel} confirmBg={leaveDialog.confirmBg} onConfirm={leaveDialog.onConfirm} onCancel={() => setLeaveDialog(null)} />}

            {lobbyState.setupPhase !== 'in_game' ? (
                <SetupFlow lobbyState={lobbyState} onLeave={() => { socket.emit('leave_room'); setRoomCode(null); setLobbyState(null); setGameState(null); }} />
            ) : (
                gameState ? <GameTable gameState={gameState} emitAction={emitAction} socket={socket} myId={socket.id} isHost={lobbyState.hostId === socket.id} onLeave={() => { socket.emit('leave_room'); setRoomCode(null); setLobbyState(null); setGameState(null); }} appPlayerName={myPlayer?.name} appRoomCode={roomCode} /> : <div style={{textAlign:"center", marginTop: 50}}>Loading Game...</div>
            )}
        </div>
    );
}

export default App;
