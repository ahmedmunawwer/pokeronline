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

    const [detailSave, setDetailSave] = useState(null);
    const [showRename, setShowRename] = useState(false);
    const [renameInput, setRenameInput] = useState('');
    const [renameError, setRenameError] = useState('');

    const [loadedFromSaveIdOverride, setLoadedFromSaveIdOverride] = useState(undefined);
    const [showSyncLoadModal, setShowSyncLoadModal] = useState(false);
    const [showPromoteModal, setShowPromoteModal] = useState(false);
    const [promoteInput, setPromoteInput] = useState('');
    const [promoteError, setPromoteError] = useState('');

    const [loadProtect, setLoadProtect] = useState(null);
    const [loadProtectPromoteName, setLoadProtectPromoteName] = useState('');
    const [loadProtectPromoteError, setLoadProtectPromoteError] = useState('');

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
        setSelectedSave(null);
        setDetailSave(null);
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
            secondName: dualSeat ? loadHostName2.trim() : undefined,
            ...(loadedFromSaveIdOverride !== undefined ? { overrideLoadedFromSaveId: loadedFromSaveIdOverride } : {})
        }, (res) => {
            if (res.success) {
                onJoined(res.roomCode, loadHostName.trim(), res.playerId, dualSeat ? loadHostName2.trim() : undefined, res.secondPlayerId);
            } else {
                setError(res.message);
            }
        });
    };

    const doLoadFromDetail = () => {
        if (detailSave.saveId === 'autosave') {
            if (detailSave.linkedSaveId && !detailSave.synced) {
                setShowSyncLoadModal(true);
                return;
            }
            setLoadedFromSaveIdOverride(detailSave.linkedSaveId || null);
            setSelectedSave(detailSave);
            setDetailSave(null);
            setLoadHostName('');
            setLoadHostName2('');
            setError('');
            return;
        }

        const autosave = saves.find(s => s.saveId === 'autosave');
        if (autosave) {
            const linkedToThis = autosave.linkedSaveId === detailSave.saveId;
            const validLink = autosave.linkedSaveId && autosave.linkedName;

            if (linkedToThis) {
                if (!autosave.synced) {
                    setLoadProtect({ type: 'linked_this_unsynced', autosave, targetSave: detailSave });
                    return;
                }
            } else if (!validLink) {
                setLoadProtectPromoteName('');
                setLoadProtectPromoteError('');
                setLoadProtect({ type: 'unlinked', autosave, targetSave: detailSave });
                return;
            } else if (!autosave.synced) {
                setLoadProtect({ type: 'linked_diff_unsynced', autosave, targetSave: detailSave });
                return;
            }
        }

        setLoadedFromSaveIdOverride(undefined);
        setSelectedSave(detailSave);
        setDetailSave(null);
        setLoadHostName('');
        setLoadHostName2('');
        setError('');
    };

    const doRename = () => {
        const trimmed = renameInput.trim();
        if (!trimmed) return setRenameError('Please enter a name');
        socket.emit('rename_save', { saveId: detailSave.saveId, newName: trimmed }, (res) => {
            if (res.success) {
                setSaves(saves.map(s => s.saveId === detailSave.saveId ? {...s, name: trimmed} : s));
                setDetailSave({...detailSave, name: trimmed});
                setShowRename(false);
            } else {
                const msg = res.message?.startsWith('DUPLICATE_NAME:')
                    ? `A save named '${trimmed}' already exists. Choose a different name.`
                    : (res.message || 'Rename failed');
                setRenameError(msg);
            }
        });
    };

    const doDelete = () => {
        if (!window.confirm(`Delete '${detailSave.name}'? This cannot be undone.`)) return;
        socket.emit('delete_save', { saveId: detailSave.saveId }, (res) => {
            if (res.success) {
                setSaves(saves.filter(s => s.saveId !== detailSave.saveId));
                if (selectedSave?.saveId === detailSave.saveId) setSelectedSave(null);
                setDetailSave(null);
            } else {
                setError(res.message || 'Delete failed');
                setDetailSave(null);
            }
        });
    };

    const doSyncAutosave = () => {
        socket.emit('sync_autosave_with_linked', (res) => {
            if (res.success) {
                socket.emit('list_saves', (lr) => { if (lr.success) setSaves(lr.saves); });
                setDetailSave(d => d ? {...d, synced: true} : d);
            } else {
                setError(res.message || 'Sync failed');
            }
        });
    };

    const doPromoteAutosave = () => {
        const trimmed = promoteInput.trim();
        if (!trimmed) return setPromoteError('Please enter a name');
        socket.emit('promote_autosave', { name: trimmed }, (res) => {
            if (res.success) {
                socket.emit('list_saves', (lr) => { if (lr.success) setSaves(lr.saves); });
                setDetailSave(d => d ? {...d, linkedSaveId: res.saveId, linkedName: trimmed, synced: true} : d);
                setShowPromoteModal(false);
            } else {
                const msg = res.message?.startsWith('DUPLICATE_NAME:')
                    ? `A save named '${trimmed}' already exists. Choose a different name.`
                    : (res.message || 'Promote failed');
                setPromoteError(msg);
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
                                <button onClick={()=>{setView("main"); setSelectedSave(null); setDetailSave(null);}} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>
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
                                        <button key={s.saveId} onClick={()=>{setDetailSave(s); setError("");}} style={{
                                            background: s.saveId === 'autosave' ? "rgba(240,192,64,0.10)" : "rgba(255,255,255,0.05)",
                                            border: s.saveId === 'autosave' ? "1px solid rgba(240,192,64,0.35)" : "1px solid rgba(255,255,255,0.1)",
                                            borderRadius:12, padding:"12px 14px", cursor:"pointer", textAlign:"left", color:"#fff", width:"100%"
                                        }}>
                                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                                                <span style={{fontWeight:700,fontSize:14}}>
                                                    {s.saveId === 'autosave' ? (
                                                        <>
                                                            ⚡ Autosave
                                                            {s.linkedSaveId && s.linkedName && (
                                                                <span style={{color: s.synced ? '#4caf50' : '#ef4444', fontWeight:600, marginLeft:6}}>
                                                                    ({s.linkedName})
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : s.name}
                                                </span>
                                                <span style={{color:DIM,fontSize:11}}>{formatDate(s.savedAt)}</span>
                                            </div>
                                            <div style={{color:DIM,fontSize:12}}>
                                                Session {s.sessionNumber} · Hand #{s.handNumber} · {s.playerCount} players
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
            {detailSave && !showRename && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
                    <div style={{background:'#1a0f0a',borderRadius:'20px 20px 0 0',padding:'24px 20px 32px',width:'100%',maxWidth:460,maxHeight:'85vh',overflowY:'auto',position:'relative'}}>
                        <button onClick={()=>{setDetailSave(null);setError('');}} style={{position:'absolute',top:16,right:16,background:'none',border:'none',color:DIM,fontSize:22,cursor:'pointer',padding:0,lineHeight:1}}>✕</button>
                        <div style={{color:G,fontWeight:800,fontSize:20,marginBottom:4,paddingRight:36}}>
                            {detailSave.saveId === 'autosave' ? '⚡ Autosave' : detailSave.name}
                        </div>
                        <div style={{color:DIM,fontSize:12,marginBottom:16}}>Saved on {formatDate(detailSave.savedAt)}</div>
                        {detailSave.saveId === 'autosave' && detailSave.linkedSaveId && (
                            <div style={{fontSize:12,marginBottom:12,color:detailSave.synced?'#4caf50':'#ef4444'}}>
                                🔗 Linked: {detailSave.linkedName || detailSave.linkedSaveId}
                                {detailSave.synced ? ' · Synced' : ' · ⚠ Unsynced'}
                            </div>
                        )}
                        <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:detailSave.cfg?.maxHandsPerSession ? 4 : 16}}>
                            Session {detailSave.sessionNumber}{detailSave.cfg?.sessions ? ' of ' + detailSave.cfg.sessions : ''} · Hand #{detailSave.handNumber}
                        </div>
                        {detailSave.cfg?.maxHandsPerSession && (
                            <div style={{color:DIM,fontSize:12,marginBottom:16}}>Max Hands per Session: {detailSave.cfg.maxHandsPerSession}</div>
                        )}
                        <div style={{marginBottom:16}}>
                            <div style={{color:'rgba(255,255,255,0.45)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Players</div>
                            {(detailSave.stacks||[]).map(p => (
                                <div key={p.name} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                    <span style={{color:'#fff',fontSize:14}}>{p.name}</span>
                                    <span style={{color:DIM,fontSize:13}}>{p.stack.toLocaleString()} chips</span>
                                </div>
                            ))}
                        </div>
                        {(() => {
                            const medals = ['🥇','🥈','🥉'];
                            const scored = (detailSave.stacks||[])
                                .map(p => ({name:p.name, score:(detailSave.scores||{})[p.id]||0}))
                                .sort((a,b) => b.score - a.score);
                            if (!scored.some(p => p.score !== 0)) return null;
                            return (
                                <div style={{marginBottom:20}}>
                                    <div style={{color:'rgba(255,255,255,0.45)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Cumulative Scores</div>
                                    {scored.map((p,i) => (
                                        <div key={p.name} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                            <span style={{color:'#fff',fontSize:14}}>{medals[i]||''} {p.name}</span>
                                            <span style={{color:G,fontSize:13,fontWeight:700}}>{p.score>0?'+':''}{p.score.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                        {detailSave.saveId === 'autosave' ? (
                            <div style={{display:'flex',flexDirection:'column',gap:10}}>
                                <Btn full bg="#2e7d32" onClick={doLoadFromDetail}>🔄 Load Game</Btn>
                                {!detailSave.linkedSaveId && (
                                    <Btn full bg="rgba(100,180,100,0.15)" onClick={()=>{setPromoteInput('');setPromoteError('');setShowPromoteModal(true);}}>💾 Promote to named save</Btn>
                                )}
                                {detailSave.linkedSaveId && !detailSave.synced && (
                                    <Btn full bg="rgba(255,193,7,0.15)" onClick={doSyncAutosave}>🔗 Sync with {detailSave.linkedName || 'linked save'}</Btn>
                                )}
                            </div>
                        ) : (
                            <div style={{display:'flex',gap:8,alignItems:'stretch'}}>
                                <div style={{flex:1}}>
                                    <Btn full bg="#2e7d32" onClick={doLoadFromDetail}>🔄 Load Game</Btn>
                                </div>
                                <button onClick={()=>{setRenameInput(detailSave.name);setRenameError('');setShowRename(true);}} style={{width:44,background:'rgba(255,255,255,0.09)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:10,color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0}}>✏️</button>
                                <button onClick={doDelete} style={{width:44,background:'rgba(160,0,0,0.35)',border:'1px solid rgba(180,0,0,0.4)',borderRadius:10,color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0}}>🗑</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {detailSave && showRename && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:201,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
                    <div style={{background:'#1a0f0a',borderRadius:16,padding:24,width:'100%',maxWidth:400}}>
                        <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:16}}>Rename Save</div>
                        <input value={renameInput} onChange={e=>{setRenameInput(e.target.value);setRenameError('');}}
                            placeholder="Save name"
                            style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:8}}
                        />
                        {renameError && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:8}}>{renameError}</div>}
                        <div style={{display:'flex',gap:10,marginTop:4}}>
                            <Btn full bg="rgba(255,255,255,0.08)" onClick={()=>setShowRename(false)}>Cancel</Btn>
                            <Btn full onClick={doRename}>Save</Btn>
                        </div>
                    </div>
                </div>
            )}
            {showPromoteModal && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:202,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
                    <div style={{background:'#1a0f0a',borderRadius:16,padding:24,width:'100%',maxWidth:400}}>
                        <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:16}}>Promote to named save</div>
                        <input value={promoteInput} onChange={e=>{setPromoteInput(e.target.value);setPromoteError('');}}
                            placeholder="Save name"
                            style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:8}}
                        />
                        {promoteError && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:8}}>{promoteError}</div>}
                        <div style={{display:'flex',gap:10,marginTop:4}}>
                            <Btn full bg="rgba(255,255,255,0.08)" onClick={()=>setShowPromoteModal(false)}>Cancel</Btn>
                            <Btn full onClick={doPromoteAutosave}>💾 Promote</Btn>
                        </div>
                    </div>
                </div>
            )}
            {loadProtect && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.80)',zIndex:202,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
                    <div style={{background:'#1a0f0a',borderRadius:16,padding:24,width:'100%',maxWidth:420}}>
                        <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:12}}>Autosave will be overwritten</div>
                        {loadProtect.type === 'unlinked' && (
                            <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:12,lineHeight:1.5}}>
                                The current autosave has unsaved progress (Session {loadProtect.autosave.sessionNumber} · Hand #{loadProtect.autosave.handNumber}). Loading <strong style={{color:'#fff'}}>{loadProtect.targetSave.name}</strong> will overwrite it. Promote to a named save first?
                            </div>
                        )}
                        {loadProtect.type === 'linked_this_unsynced' && (
                            <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:16,lineHeight:1.5}}>
                                The autosave is ahead of <strong style={{color:'#fff'}}>{loadProtect.targetSave.name}</strong> (Session {loadProtect.autosave.sessionNumber} · Hand #{loadProtect.autosave.handNumber}). Loading will overwrite the autosave. Sync first?
                            </div>
                        )}
                        {loadProtect.type === 'linked_diff_unsynced' && (
                            <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:16,lineHeight:1.5}}>
                                Autosave has unsaved progress for <strong style={{color:'#fff'}}>{loadProtect.autosave.linkedName}</strong> (Session {loadProtect.autosave.sessionNumber} · Hand #{loadProtect.autosave.handNumber}). Loading <strong style={{color:'#fff'}}>{loadProtect.targetSave.name}</strong> will overwrite it. Sync first?
                            </div>
                        )}
                        {loadProtect.type === 'unlinked' && (<>
                            <input value={loadProtectPromoteName} onChange={e=>{setLoadProtectPromoteName(e.target.value);setLoadProtectPromoteError('');}}
                                placeholder="Save name"
                                style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:8}}
                            />
                            {loadProtectPromoteError && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:8}}>{loadProtectPromoteError}</div>}
                        </>)}
                        <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:4}}>
                            {loadProtect.type === 'unlinked' && (
                                <Btn full bg="#2e7d32" onClick={()=>{
                                    const n = loadProtectPromoteName.trim();
                                    if (!n) return setLoadProtectPromoteError('Please enter a name');
                                    socket.emit('promote_autosave', { name: n }, (res) => {
                                        if (res.success) {
                                            socket.emit('list_saves', lr => { if (lr.success) setSaves(lr.saves); });
                                            const ts = loadProtect.targetSave;
                                            setLoadProtect(null);
                                            setLoadedFromSaveIdOverride(undefined);
                                            setSelectedSave(ts);
                                            setDetailSave(null);
                                            setLoadHostName('');
                                            setLoadHostName2('');
                                        } else {
                                            const msg = res.message?.startsWith('DUPLICATE_NAME:')
                                                ? `A save named '${n}' already exists. Choose a different name.`
                                                : (res.message || 'Promote failed');
                                            setLoadProtectPromoteError(msg);
                                        }
                                    });
                                }}>💾 Promote and load</Btn>
                            )}
                            {(loadProtect.type === 'linked_this_unsynced' || loadProtect.type === 'linked_diff_unsynced') && (
                                <Btn full bg="#2e7d32" onClick={()=>{
                                    socket.emit('sync_autosave_with_linked', (res) => {
                                        const ts = loadProtect.targetSave;
                                        if (res.success) {
                                            socket.emit('list_saves', lr => { if (lr.success) setSaves(lr.saves); });
                                        } else {
                                            setError(res.message || 'Sync failed');
                                        }
                                        setLoadProtect(null);
                                        setLoadedFromSaveIdOverride(undefined);
                                        setSelectedSave(ts);
                                        setDetailSave(null);
                                        setLoadHostName('');
                                        setLoadHostName2('');
                                    });
                                }}>🔗 Sync and load</Btn>
                            )}
                            <Btn full bg="rgba(255,255,255,0.09)" onClick={()=>{
                                const ts = loadProtect.targetSave;
                                setLoadProtect(null);
                                setLoadedFromSaveIdOverride(undefined);
                                setSelectedSave(ts);
                                setDetailSave(null);
                                setLoadHostName('');
                                setLoadHostName2('');
                            }}>Discard and load</Btn>
                            <Btn full bg="rgba(255,255,255,0.05)" onClick={()=>setLoadProtect(null)}>Cancel</Btn>
                        </div>
                    </div>
                </div>
            )}
            {showSyncLoadModal && detailSave && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:202,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
                    <div style={{background:'#1a0f0a',borderRadius:16,padding:24,width:'100%',maxWidth:420}}>
                        <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:12}}>Sync linked save?</div>
                        <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:20,lineHeight:1.5}}>
                            Autosave is at Session {detailSave.sessionNumber} · Hand #{detailSave.handNumber} but <strong style={{color:'#fff'}}>{detailSave.linkedName || 'linked save'}</strong> is behind. Sync it to match before loading?
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:10}}>
                            <Btn full bg="#2e7d32" onClick={()=>{
                                socket.emit('sync_autosave_with_linked', (res) => {
                                    if (res.success) {
                                        socket.emit('list_saves', (lr) => { if (lr.success) setSaves(lr.saves); });
                                        setShowSyncLoadModal(false);
                                        setLoadedFromSaveIdOverride(detailSave.linkedSaveId);
                                        setSelectedSave(detailSave);
                                        setDetailSave(null);
                                        setLoadHostName('');
                                        setLoadHostName2('');
                                    } else {
                                        setError(res.message || 'Sync failed');
                                        setShowSyncLoadModal(false);
                                    }
                                });
                            }}>🔗 Sync and Load</Btn>
                            <Btn full bg="rgba(255,255,255,0.09)" onClick={()=>{
                                setShowSyncLoadModal(false);
                                setLoadedFromSaveIdOverride(detailSave.linkedSaveId);
                                setSelectedSave(detailSave);
                                setDetailSave(null);
                                setLoadHostName('');
                                setLoadHostName2('');
                            }}>Load without syncing</Btn>
                            <Btn full bg="rgba(255,255,255,0.05)" onClick={()=>setShowSyncLoadModal(false)}>Cancel</Btn>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
