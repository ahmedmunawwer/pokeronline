import React, { useState, useEffect } from 'react';
import socket from '../socket';
import { Btn, Card, Fld, G, DIM } from './UI';

export default function Lobby({ onJoined }) {
    const [view, setView] = useState("main"); // main, host, join, load, load_select
    
    // Host state
    const [hostName, setHostName] = useState("Host");
    const [hostRoomCode, setHostRoomCode] = useState("");
    const [maxPlayers, setMaxPlayers] = useState("6");
    const [equalStack, setEqualStack] = useState(true);

    // Join state
    const [joinCode, setJoinCode] = useState("");
    const [joinName, setJoinName] = useState("Joinee 1");
    const [nameLoaded, setNameLoaded] = useState(false);
    const [existingNames, setExistingNames] = useState([]);
    const [nameError, setNameError] = useState("");

    // Load state
    const [saves, setSaves] = useState([]);
    const [selectedSave, setSelectedSave] = useState(null);
    const [loadHostName, setLoadHostName] = useState("");

    const [error, setError] = useState("");

    // Refresh server-driven autofill every time the home screen is shown
    useEffect(() => {
        if (view !== 'main') return;
        // Reset join form so stale values don't linger
        setJoinCode('');
        setJoinName('Joinee 1');
        setNameLoaded(false);
        setExistingNames([]);
        setNameError('');

        const fetchCodes = () => {
            socket.emit('get_default_room_codes', (res) => {
                setHostRoomCode(res.nextAvailableHostCode || '');
                if (res.latestJoineeCode) {
                    setJoinCode(res.latestJoineeCode);
                    if (res.latestJoineeCode.length === 1) {
                        socket.emit('get_default_name', res.latestJoineeCode, (nameRes) => {
                            if (nameRes?.name) {
                                setJoinName(nameRes.name);
                                setExistingNames(nameRes.existingNames || []);
                                setNameLoaded(true);
                            }
                        });
                    }
                }
            });
        };

        if (socket.connected) {
            fetchCodes();
        } else {
            socket.once('connect', fetchCodes);
        }

        return () => { socket.off('connect', fetchCodes); };
    }, [view]);

    const doHost = () => {
        if (!hostName.trim()) return setError("Please enter your name");
        const mp = parseInt(maxPlayers);
        if (isNaN(mp) || mp < 2 || mp > 10) return setError("Max players must be between 2 and 10");
        if (!/^[1-9]$/.test(hostRoomCode.trim())) return setError("Room code must be a single digit 1–9");

        socket.emit("host_game", {
            name: hostName.trim(),
            roomCode: hostRoomCode.trim(),
            maxPlayers: mp,
            equalStack
        }, (res) => {
            if (res.success) {
                localStorage.setItem('ag_session', JSON.stringify({
                    playerId: res.playerId,
                    roomCode: res.roomCode,
                    playerName: hostName.trim(),
                    isHost: true,
                    joinedAt: Date.now()
                }));
                onJoined(res.roomCode);
            } else {
                setError(res.message);
            }
        });
    };

    const handleCodeChange = (e) => {
        const code = e.target.value;
        setJoinCode(code);
        setNameError("");
        if (code.length >= 1 && !nameLoaded) {
            const isLoaded = code.length === 2;
            if (isLoaded) {
                setJoinName("");
                setExistingNames([]);
                setNameLoaded(true);
            } else if (code.length === 1) {
                socket.emit('get_default_name', code, (res) => {
                    if (res && res.name) {
                        setJoinName(res.name);
                        setExistingNames(res.existingNames || []);
                        setNameLoaded(true);
                    }
                });
            }
        }
        if (code.length === 0) { setNameLoaded(false); setJoinName("Joinee 1"); setExistingNames([]); }
    };

    const handleJoinNameChange = (e) => {
        const val = e.target.value;
        setJoinName(val);
        if (existingNames.some(n => n.toLowerCase() === val.trim().toLowerCase())) {
            setNameError("Name already taken — choose another");
        } else {
            setNameError("");
        }
    };

    const doJoin = () => {
        if (!joinCode || (joinCode.length !== 1 && joinCode.length !== 2)) return setError("Enter a valid room code");
        if (!joinName.trim()) return setError("Please enter your name");

        const isLoadedCode = joinCode.length === 2;
        const event = isLoadedCode ? "join_loaded_game" : "join_game";

        socket.emit(event, {
            roomCode: joinCode,
            name: joinName.trim()
        }, (res) => {
            if (res.success) {
                localStorage.setItem('ag_session', JSON.stringify({
                    playerId: res.playerId,
                    roomCode: joinCode,
                    playerName: joinName.trim(),
                    isHost: false,
                    joinedAt: Date.now()
                }));
                onJoined(joinCode);
            } else {
                setError(res.message);
            }
        });
    };

    const openLoadView = () => {
        setError("");
        socket.emit('list_saves', (res) => {
            if (res.success) {
                setSaves(res.saves);
                setView("load");
            } else {
                setError(res.message || "Could not load saves");
            }
        });
    };

    const doLoadGame = () => {
        if (!selectedSave) return setError("Select a saved game");
        if (!loadHostName.trim()) return setError("Enter your name from the original game");

        socket.emit('load_game', {
            saveId: selectedSave.saveId,
            hostName: loadHostName.trim()
        }, (res) => {
            if (res.success) {
                localStorage.setItem('ag_session', JSON.stringify({
                    playerId: res.playerId,
                    roomCode: res.roomCode,
                    playerName: loadHostName.trim(),
                    isHost: true,
                    joinedAt: Date.now()
                }));
                onJoined(res.roomCode);
            } else {
                setError(res.message);
            }
        });
    };

    const formatDate = (iso) => {
        try { 
            const d = new Date(iso);
            return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        } catch(e) { return iso; }
    };

    return (
        <div style={{minHeight:"100vh",background:"radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{maxWidth: 460, width: "100%"}}>
                <Card sx={{textAlign:"center"}}>
                    <div style={{fontSize:44,marginBottom:10}}>🃏</div>
                    <h1 style={{fontSize:22,fontWeight:800,color:G,margin:"0 0 20px"}}>POKER MULTIPLAYER</h1>
                    
                    {error && <div style={{background:"rgba(255,0,0,0.2)",border:"1px solid red",color:"#fff",padding:10,borderRadius:8,marginBottom:15,fontSize:13}}>{error}</div>}
                    
                    {view === "main" && (
                        <div style={{display:"flex",flexDirection:"column",gap:16}}>
                            <Btn full onClick={() => { setView("host"); setError(""); }}>Host New Game</Btn>
                            <Btn full bg="#1976d2" onClick={() => { setView("join"); setError(""); }}>Join Game</Btn>
                            <Btn full bg="#7a4a1a" onClick={openLoadView}>📂 Load Game</Btn>
                        </div>
                    )}

                    {view === "host" && (
                        <div style={{textAlign:"left"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                                <button onClick={()=>setView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>
                                <span style={{color:G,fontWeight:700,fontSize:15}}>Host Options</span>
                            </div>
                            <Fld lbl="Your Name" val={hostName} ch={e=>setHostName(e.target.value)} ph="e.g. John" />
                            <Fld lbl="Room Code (1–9)" val={hostRoomCode} ch={e=>setHostRoomCode(e.target.value)} type="number" />
                            <Fld lbl="Max Players (2-10)" val={maxPlayers} ch={e=>setMaxPlayers(e.target.value)} type="number" />
                            <div style={{marginBottom: 16, marginTop: 12}}>
                                <label style={{color:"#fff", fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
                                    <input type="checkbox" checked={equalStack} onChange={e=>setEqualStack(e.target.checked)} style={{width: 18, height: 18}}/>
                                    Equal opening stack for all
                                </label>
                            </div>
                            <Btn full onClick={doHost}>Create Room</Btn>
                        </div>
                    )}

                    {view === "join" && (
                        <div style={{textAlign:"left"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                                <button onClick={()=>setView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>
                                <span style={{color:G,fontWeight:700,fontSize:15}}>Join Room</span>
                            </div>
                            <Fld lbl="Room Code" val={joinCode} ch={handleCodeChange} type="number" />
                            <div style={{color:DIM,fontSize:11,marginTop:-8,marginBottom:10}}>1 digit = new game, 2 digits = loaded game</div>
                            <Fld lbl="Your Name" val={joinName} ch={handleJoinNameChange} ph={joinCode.length === 2 ? "Your original name" : "e.g. Alice"} />
                            {nameError && <div style={{color:"#ff6b6b",fontSize:12,marginTop:-8,marginBottom:10,paddingLeft:2}}>{nameError}</div>}
                            <Btn full dis={!!nameError} onClick={doJoin}>Connect to Table</Btn>
                        </div>
                    )}

                    {view === "load" && (
                        <div style={{textAlign:"left"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                                <button onClick={()=>{setView("main"); setSelectedSave(null);}} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>
                                <span style={{color:G,fontWeight:700,fontSize:15}}>Load Saved Game</span>
                            </div>
                            
                            {saves.length === 0 ? (
                                <div style={{textAlign:"center",padding:30,color:DIM}}>
                                    <div style={{fontSize:36,marginBottom:10}}>📭</div>
                                    No saved games found.
                                </div>
                            ) : (
                                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16,maxHeight:300,overflowY:"auto"}}>
                                    {saves.map(s => (
                                        <button key={s.saveId} onClick={()=>{setSelectedSave(s); setError("");}} style={{
                                            background: selectedSave?.saveId === s.saveId ? "rgba(240,192,64,0.15)" : "rgba(255,255,255,0.05)",
                                            border: selectedSave?.saveId === s.saveId ? "1px solid rgba(240,192,64,0.5)" : "1px solid rgba(255,255,255,0.1)",
                                            borderRadius:12, padding:"12px 14px", cursor:"pointer", textAlign:"left", color:"#fff"
                                        }}>
                                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                                                <span style={{fontWeight:700,fontSize:14}}>Hand #{s.handNumber} · Session {s.sessionNumber}</span>
                                                <span style={{color:DIM,fontSize:11}}>{formatDate(s.savedAt)}</span>
                                            </div>
                                            <div style={{color:DIM,fontSize:12}}>
                                                {s.playerCount} players: {s.playerNames.join(", ")}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {selectedSave && (
                                <div style={{borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:14}}>
                                    <div style={{color:DIM,fontSize:12,marginBottom:8}}>Enter your name from the original game:</div>
                                    <div style={{color:DIM,fontSize:11,marginBottom:8}}>Expected: {selectedSave.playerNames.join(", ")}</div>
                                    <Fld lbl="Your Name" val={loadHostName} ch={e=>setLoadHostName(e.target.value)} ph="Your original name" />
                                    <Btn full bg="#7a4a1a" onClick={doLoadGame}>🔄 Create Loaded Room</Btn>
                                </div>
                            )}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
