import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import { Btn, Card, Fld, G, DIM } from './UI';

const PLAYER_POOL = ['Munz', 'Ray', 'Rizu', 'Rit', 'Manu', 'Ramez', 'Zanu', 'Sapu', 'Fahim'];

export default function Lobby({ onJoined }) {
    const [view, setView] = useState("main"); // main, host, join, load, load_select
    
    // Host state
    const [hostName, setHostName] = useState("");
    const [hostRoomCode, setHostRoomCode] = useState("");
    const [maxPlayers, setMaxPlayers] = useState("6");
    const [equalStack, setEqualStack] = useState(true);
    const [showHostNameDropdown, setShowHostNameDropdown] = useState(false);
    const [dualSeat, setDualSeat] = useState(false);
    const [hostName2, setHostName2] = useState("");
    const [joinName2, setJoinName2] = useState("");
    const [loadHostName2, setLoadHostName2] = useState("");
    const [showHostNameDropdown2, setShowHostNameDropdown2] = useState(false);
    const [showJoinDropdown2, setShowJoinDropdown2] = useState(false);
    const [showLoadDropdown2, setShowLoadDropdown2] = useState(false);

    // Join state
    const [joinCode, setJoinCode] = useState("");
    const [joinName, setJoinName] = useState("");
    const [nameLoaded, setNameLoaded] = useState(false);
    const [existingNames, setExistingNames] = useState([]);
    const [nameError, setNameError] = useState("");
    const [expectedNames, setExpectedNames] = useState([]);
    const [showJoinDropdown, setShowJoinDropdown] = useState(false);
    const nameReqRef = useRef(0);

    // Load state
    const [saves, setSaves] = useState([]);
    const [selectedSave, setSelectedSave] = useState(null);
    const [loadHostName, setLoadHostName] = useState("");
    const [showLoadDropdown, setShowLoadDropdown] = useState(false);

    const [error, setError] = useState("");

    // Fetch latest room codes when entering host/join screens
    useEffect(() => {
        if (view !== 'main') return;

        // Reset forms when returning to main
        setJoinCode('');
        setJoinName('');
        setNameLoaded(false);
        setExistingNames([]);
        setNameError('');
        setHostRoomCode('');
        setError('');
        setDualSeat(false);
        setHostName2('');
        setJoinName2('');
        setLoadHostName2('');

        const fetchCodes = () => {
            socket.emit('get_default_room_codes', (res) => {
                setHostRoomCode(res.nextAvailableHostCode || '');
                if (res.latestJoineeCode) {
                    setJoinCode(res.latestJoineeCode);
                    if (res.latestJoineeCode.length === 1) {
                        socket.emit('get_default_name', res.latestJoineeCode, (nameRes) => {
                            if (nameRes) {
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

    // Auto-fill join code when entering join screen
    useEffect(() => {
        if (view !== 'join') return;
        const fetchJoin = () => {
            socket.emit('get_default_room_codes', (res) => {
                if (res.latestJoineeCode) {
                    setJoinCode(res.latestJoineeCode);
                    if (res.latestJoineeCode.length === 1 && !nameLoaded) {
                        socket.emit('get_default_name', res.latestJoineeCode, (nameRes) => {
                            if (nameRes) {
                                setExistingNames(nameRes.existingNames || []);
                                setNameLoaded(true);
                            }
                        });
                    }
                }
            });
        };
        if (socket.connected) fetchJoin();
        else socket.once('connect', fetchJoin);
    }, [view]);

    // Auto-fill host code when entering host screen
    useEffect(() => {
        if (view !== 'host') return;
        const fetchHost = () => {
            socket.emit('get_default_room_codes', (res) => {
                if (res.nextAvailableHostCode) setHostRoomCode(res.nextAvailableHostCode);
            });
        };
        if (socket.connected) fetchHost();
        else socket.once('connect', fetchHost);
    }, [view]);

    const doHost = () => {
        if (!hostName.trim()) return setError("Please enter your name");
        if (dualSeat && !hostName2.trim()) return setError("Please enter the second player's name");
        if (dualSeat && hostName.trim().toLowerCase() === hostName2.trim().toLowerCase()) return setError("Both names must be different");
        const mp = parseInt(maxPlayers);
        if (isNaN(mp) || mp < 2 || mp > 10) return setError("Max players must be between 2 and 10");
        if (!/^[1-9]$/.test(hostRoomCode.trim())) return setError("Room code must be a single digit 1–9");

        socket.emit("host_game", {
            name: hostName.trim(),
            secondName: dualSeat ? hostName2.trim() : undefined,
            roomCode: hostRoomCode.trim(),
            maxPlayers: mp,
            equalStack
        }, (res) => {
            if (res.success) {
                onJoined(res.roomCode, hostName.trim(), res.playerId, dualSeat ? hostName2.trim() : undefined, res.secondPlayerId);
            } else {
                setError(res.message);
            }
        });
    };

    const handleCodeChange = (e) => {
        const code = e.target.value;
        setJoinCode(code);
        setNameError("");
        setJoinName2("");
        if (code.length === 0) {
            setNameLoaded(false);
            setJoinName("");
            setExistingNames([]);
            setExpectedNames([]);
            return;
        }
        if (code.length === 2) {
            nameReqRef.current += 1;
            setJoinName("");
            setExistingNames([]);
            setNameLoaded(true);
            const reqId = nameReqRef.current;
            socket.emit('get_default_name', code, (res) => {
                if (nameReqRef.current !== reqId) return;
                setExpectedNames(res?.expectedNames || []);
            });
            return;
        }
        if (code.length === 1 && !nameLoaded) {
            const reqId = ++nameReqRef.current;
            socket.emit('get_default_name', code, (res) => {
                if (nameReqRef.current !== reqId) return;
                if (res) {
                    setExistingNames(res.existingNames || []);
                    setNameLoaded(true);
                }
            });
        }
    };

    const handleJoinNameChange = (e) => {
        const val = e.target.value;
        setJoinName(val);
        if (joinCode.length !== 2 && existingNames.some(n => n.toLowerCase() === val.trim().toLowerCase())) {
            setNameError("Name already taken — choose another");
        } else {
            setNameError("");
        }
    };

    const doJoin = () => {
        if (!joinCode || (joinCode.length !== 1 && joinCode.length !== 2)) return setError("Enter a valid room code");
        if (!joinName.trim()) return setError("Please enter your name");
        if (dualSeat && !joinName2.trim()) return setError("Please enter the second player's name");
        if (dualSeat && joinName.trim().toLowerCase() === joinName2.trim().toLowerCase()) return setError("Both names must be different");

        const isLoadedCode = joinCode.length === 2;
        const event = isLoadedCode ? "join_loaded_game" : "join_game";

        socket.emit(event, {
            roomCode: joinCode,
            name: joinName.trim(),
            secondName: dualSeat ? joinName2.trim() : undefined
        }, (res) => {
            if (res.success) {
                onJoined(joinCode, joinName.trim(), res.playerId, dualSeat ? joinName2.trim() : undefined, res.secondPlayerId);
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
        if (dualSeat && !loadHostName2.trim()) return setError("Enter the second player's name");
        if (dualSeat && loadHostName.trim().toLowerCase() === loadHostName2.trim().toLowerCase()) return setError("Both names must be different");

        socket.emit('load_game', {
            saveId: selectedSave.saveId,
            hostName: loadHostName.trim(),
            secondName: dualSeat ? loadHostName2.trim() : undefined
        }, (res) => {
            if (res.success) {
                onJoined(res.roomCode, loadHostName.trim(), res.playerId, dualSeat ? loadHostName2.trim() : undefined, res.secondPlayerId);
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

    const filteredHostPool = PLAYER_POOL.filter(n =>
        n.toLowerCase().startsWith(hostName.toLowerCase()) &&
        (!dualSeat || n.toLowerCase() !== hostName2.trim().toLowerCase())
    );
    const filteredHostPool2 = PLAYER_POOL.filter(n =>
        n.toLowerCase().startsWith(hostName2.toLowerCase()) &&
        n.toLowerCase() !== hostName.trim().toLowerCase()
    );
    const filteredJoinPool = PLAYER_POOL.filter(n =>
        n.toLowerCase().startsWith(joinName.toLowerCase()) &&
        !existingNames.some(e => e.toLowerCase() === n.toLowerCase()) &&
        (!dualSeat || n.toLowerCase() !== joinName2.trim().toLowerCase())
    );
    const filteredJoinPool2 = PLAYER_POOL.filter(n =>
        n.toLowerCase().startsWith(joinName2.toLowerCase()) &&
        !existingNames.some(e => e.toLowerCase() === n.toLowerCase()) &&
        n.toLowerCase() !== joinName.trim().toLowerCase()
    );

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
                            <div style={{marginBottom:14,position:'relative'}}>
                                <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                                <input
                                    value={hostName}
                                    onChange={e => setHostName(e.target.value)}
                                    onFocus={() => setShowHostNameDropdown(true)}
                                    onBlur={() => setShowHostNameDropdown(false)}
                                    placeholder="Your name"
                                    style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none'}}
                                />
                                {showHostNameDropdown && filteredHostPool.length > 0 && (
                                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#2a1a0e',border:'1px solid rgba(240,192,64,0.3)',borderRadius:8,zIndex:10,overflow:'hidden',marginTop:2}}>
                                        {filteredHostPool.map(n => (
                                            <div key={n}
                                                onMouseDown={(e) => { e.preventDefault(); setHostName(n); setShowHostNameDropdown(false); }}
                                                onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                onMouseLeave={e => e.currentTarget.style.background=''}
                                                style={{padding:'10px 12px',cursor:'pointer',fontSize:14,color:'#fff',borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                            >{n}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{marginBottom: dualSeat ? 10 : 14, marginTop:4}}>
                                <label style={{color:DIM, fontSize:13, display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none'}}>
                                    <input type="checkbox" checked={dualSeat} onChange={e => { setDualSeat(e.target.checked); setHostName2(''); }} style={{width:16, height:16, accentColor:'#f0c040'}} />
                                    Play 2 players from this device
                                </label>
                            </div>
                            {dualSeat && (
                                <div style={{marginBottom:14, position:'relative'}}>
                                    <div style={{color:'rgba(255,255,255,0.5)', fontSize:12, marginBottom:5, fontWeight:600}}>Second Player's Name</div>
                                    <input
                                        value={hostName2}
                                        onChange={e => setHostName2(e.target.value)}
                                        onFocus={() => setShowHostNameDropdown2(true)}
                                        onBlur={() => setShowHostNameDropdown2(false)}
                                        placeholder="Second player"
                                        style={{width:'100%', padding:'10px 12px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'#fff', fontSize:14, boxSizing:'border-box', outline:'none'}}
                                    />
                                    {showHostNameDropdown2 && filteredHostPool2.length > 0 && (
                                        <div style={{position:'absolute', top:'100%', left:0, right:0, background:'#2a1a0e', border:'1px solid rgba(240,192,64,0.3)', borderRadius:8, zIndex:10, overflow:'hidden', marginTop:2}}>
                                            {filteredHostPool2.map(n => (
                                                <div key={n}
                                                    onMouseDown={e => { e.preventDefault(); setHostName2(n); setShowHostNameDropdown2(false); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                    onMouseLeave={e => e.currentTarget.style.background=''}
                                                    style={{padding:'10px 12px', cursor:'pointer', fontSize:14, color:'#fff', borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                                >{n}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
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
                            <div style={{marginBottom:14,position:'relative'}}>
                                <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                                <input
                                    value={joinName}
                                    onChange={handleJoinNameChange}
                                    onFocus={() => {
                                        if (joinCode.length === 1) setShowJoinDropdown(true);
                                        else if (joinCode.length === 2 && expectedNames.length > 0) setShowJoinDropdown(true);
                                    }}
                                    onBlur={() => setShowJoinDropdown(false)}
                                    placeholder={joinCode.length === 2 ? "Your original name" : "e.g. Alice"}
                                    style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none'}}
                                />
                                {showJoinDropdown && joinCode.length === 1 && filteredJoinPool.length > 0 && (
                                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#2a1a0e',border:'1px solid rgba(240,192,64,0.3)',borderRadius:8,zIndex:10,overflow:'hidden',marginTop:2}}>
                                        {filteredJoinPool.map(n => (
                                            <div key={n}
                                                onMouseDown={(e) => { e.preventDefault(); setJoinName(n); setShowJoinDropdown(false); }}
                                                onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                onMouseLeave={e => e.currentTarget.style.background=''}
                                                style={{padding:'10px 12px',cursor:'pointer',fontSize:14,color:'#fff',borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                            >{n}</div>
                                        ))}
                                    </div>
                                )}
                                {showJoinDropdown && joinCode.length === 2 && expectedNames.length > 0 && (
                                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#2a1a0e',border:'1px solid rgba(240,192,64,0.3)',borderRadius:8,zIndex:10,overflow:'hidden',marginTop:2}}>
                                        {expectedNames.map(n => (
                                            <div key={n}
                                                onMouseDown={(e) => { e.preventDefault(); setJoinName(n); setShowJoinDropdown(false); }}
                                                onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                onMouseLeave={e => e.currentTarget.style.background=''}
                                                style={{padding:'10px 12px',cursor:'pointer',fontSize:14,color:'#fff',borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                            >{n}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{marginBottom: dualSeat ? 10 : 0, marginTop:4}}>
                                <label style={{color:DIM, fontSize:13, display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none'}}>
                                    <input type="checkbox" checked={dualSeat} onChange={e => { setDualSeat(e.target.checked); setJoinName2(''); }} style={{width:16, height:16, accentColor:'#f0c040'}} />
                                    Play 2 players from this device
                                </label>
                            </div>
                            {dualSeat && (
                                <div style={{marginBottom:14, position:'relative'}}>
                                    <div style={{color:'rgba(255,255,255,0.5)', fontSize:12, marginBottom:5, fontWeight:600}}>Second Player's Name</div>
                                    <input
                                        value={joinName2}
                                        onChange={e => setJoinName2(e.target.value)}
                                        onFocus={() => {
                                            if (joinCode.length === 1) setShowJoinDropdown2(true);
                                            else if (joinCode.length === 2 && expectedNames.length > 0) setShowJoinDropdown2(true);
                                        }}
                                        onBlur={() => setShowJoinDropdown2(false)}
                                        placeholder={joinCode.length === 2 ? "Their original name" : "Second player"}
                                        style={{width:'100%', padding:'10px 12px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'#fff', fontSize:14, boxSizing:'border-box', outline:'none'}}
                                    />
                                    {showJoinDropdown2 && joinCode.length === 1 && filteredJoinPool2.length > 0 && (
                                        <div style={{position:'absolute', top:'100%', left:0, right:0, background:'#2a1a0e', border:'1px solid rgba(240,192,64,0.3)', borderRadius:8, zIndex:10, overflow:'hidden', marginTop:2}}>
                                            {filteredJoinPool2.map(n => (
                                                <div key={n}
                                                    onMouseDown={e => { e.preventDefault(); setJoinName2(n); setShowJoinDropdown2(false); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                    onMouseLeave={e => e.currentTarget.style.background=''}
                                                    style={{padding:'10px 12px', cursor:'pointer', fontSize:14, color:'#fff', borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                                >{n}</div>
                                            ))}
                                        </div>
                                    )}
                                    {showJoinDropdown2 && joinCode.length === 2 && expectedNames.length > 0 && (
                                        <div style={{position:'absolute', top:'100%', left:0, right:0, background:'#2a1a0e', border:'1px solid rgba(240,192,64,0.3)', borderRadius:8, zIndex:10, overflow:'hidden', marginTop:2}}>
                                            {expectedNames.filter(n => n.toLowerCase() !== joinName.trim().toLowerCase()).map(n => (
                                                <div key={n}
                                                    onMouseDown={e => { e.preventDefault(); setJoinName2(n); setShowJoinDropdown2(false); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                    onMouseLeave={e => e.currentTarget.style.background=''}
                                                    style={{padding:'10px 12px', cursor:'pointer', fontSize:14, color:'#fff', borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                                >{n}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
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
                                                <span style={{fontWeight:700,fontSize:14}}>{s.saveId === 'autosave' ? '⚡ Autosave · ' : ''}Hand #{s.handNumber} · Session {s.sessionNumber}</span>
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
                                    <div style={{marginBottom:14,position:'relative'}}>
                                    <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                                    <input
                                        value={loadHostName}
                                        onChange={e => setLoadHostName(e.target.value)}
                                        onFocus={() => setShowLoadDropdown(true)}
                                        onBlur={() => setShowLoadDropdown(false)}
                                        placeholder="Your original name"
                                        style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none'}}
                                    />
                                    {showLoadDropdown && selectedSave?.playerNames?.length > 0 && (
                                        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#2a1a0e',border:'1px solid rgba(240,192,64,0.3)',borderRadius:8,zIndex:10,overflow:'hidden',marginTop:2}}>
                                            {selectedSave.playerNames.map(n => (
                                                <div key={n}
                                                    onMouseDown={(e) => { e.preventDefault(); setLoadHostName(n); setShowLoadDropdown(false); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                    onMouseLeave={e => e.currentTarget.style.background=''}
                                                    style={{padding:'10px 12px',cursor:'pointer',fontSize:14,color:'#fff',borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                                >{n}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                    <div style={{marginBottom: dualSeat ? 10 : 14, marginTop:4}}>
                                        <label style={{color:DIM, fontSize:13, display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none'}}>
                                            <input type="checkbox" checked={dualSeat} onChange={e => { setDualSeat(e.target.checked); setLoadHostName2(''); }} style={{width:16, height:16, accentColor:'#f0c040'}} />
                                            Play 2 players from this device
                                        </label>
                                    </div>
                                    {dualSeat && (
                                        <div style={{marginBottom:14, position:'relative'}}>
                                            <div style={{color:'rgba(255,255,255,0.5)', fontSize:12, marginBottom:5, fontWeight:600}}>Second Player's Name</div>
                                            <input value={loadHostName2} onChange={e => setLoadHostName2(e.target.value)}
                                                onFocus={() => setShowLoadDropdown2(true)} onBlur={() => setShowLoadDropdown2(false)}
                                                placeholder="Their original name"
                                                style={{width:'100%', padding:'10px 12px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'#fff', fontSize:14, boxSizing:'border-box', outline:'none'}}
                                            />
                                            {showLoadDropdown2 && selectedSave?.playerNames?.length > 0 && (
                                                <div style={{position:'absolute', top:'100%', left:0, right:0, background:'#2a1a0e', border:'1px solid rgba(240,192,64,0.3)', borderRadius:8, zIndex:10, overflow:'hidden', marginTop:2}}>
                                                    {selectedSave.playerNames.filter(n => n.toLowerCase() !== loadHostName.trim().toLowerCase()).map(n => (
                                                        <div key={n} onMouseDown={e => { e.preventDefault(); setLoadHostName2(n); setShowLoadDropdown2(false); }}
                                                            onMouseEnter={e => e.currentTarget.style.background='rgba(240,192,64,0.12)'}
                                                            onMouseLeave={e => e.currentTarget.style.background=''}
                                                            style={{padding:'10px 12px', cursor:'pointer', fontSize:14, color:'#fff', borderBottom:'1px solid rgba(255,255,255,0.07)'}}
                                                        >{n}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
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
