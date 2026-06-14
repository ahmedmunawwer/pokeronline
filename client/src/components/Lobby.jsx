import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import { Btn, Card, Fld, G, DIM, computeMedal, ScoreboardStatsView } from './UI';

function computeAllTimeStats(entries) {
    const map = {};
    for (const entry of entries) {
        const isCompleted = entry.completionStatus === 'completed';
        for (const name of (entry.playerNames || [])) {
            const key = name.toLowerCase();
            if (!map[key]) {
                map[key] = { displayName: name, gamesPlayed: 0, gamesWon: 0,
                             handsWon: 0, handsPlayed: 0, biggestWin: 0, biggestLoss: 0,
                             favHandsMap: {} };
            } else {
                map[key].displayName = name;
            }
            map[key].gamesPlayed++;
        }
        if (isCompleted && entry.winner) {
            const wk = entry.winner.toLowerCase();
            if (map[wk]) map[wk].gamesWon++;
        }
        for (const hand of (entry.history || [])) {
            const pnMap = hand.playerNames || {};
            const netMap = hand.net || {};
            for (const [id, name] of Object.entries(pnMap)) {
                const key = name.toLowerCase();
                if (!map[key]) continue;
                map[key].handsPlayed++;
                const net = netMap[id] || 0;
                if (net > 0 && net > map[key].biggestWin) map[key].biggestWin = net;
                if (net < 0 && Math.abs(net) > map[key].biggestLoss) map[key].biggestLoss = Math.abs(net);
            }
            if (hand.wid && pnMap[hand.wid]) {
                const wk = pnMap[hand.wid].toLowerCase();
                if (map[wk]) {
                    map[wk].handsWon++;
                    if (hand.hr) map[wk].favHandsMap[hand.hr] = (map[wk].favHandsMap[hand.hr] || 0) + 1;
                }
            }
        }
    }
    return Object.values(map).map(p => {
        const winRate = p.handsPlayed > 0 ? Math.round(p.handsWon / p.handsPlayed * 100) : 0;
        const favHandArr = Object.entries(p.favHandsMap).sort((a, b) => b[1] - a[1]);
        const favHand = favHandArr.length ? favHandArr[0][0] + ' ×' + favHandArr[0][1] : '—';
        return { ...p, winRate, favHand };
    }).sort((a, b) => b.gamesWon !== a.gamesWon ? b.gamesWon - a.gamesWon : b.winRate - a.winRate);
}


function NamePicker({ presets, value, excludeNames, onChange, onCustom, onEditPresets }) {
    const [expanded, setExpanded] = useState(!value);
    const available = presets.filter(
        p => !excludeNames.some(e => e.toLowerCase() === p.name.toLowerCase())
    );
    if (!expanded) {
        return (
            <div onMouseDown={() => setExpanded(true)}
                style={{padding:'10px 12px',borderRadius:8,border:'1px solid rgba(255,255,255,0.15)',background:'rgba(255,255,255,0.05)',cursor:'pointer',fontSize:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:value?'#f0c040':DIM,fontWeight:value?700:400}}>{value || 'Pick a name...'}</span>
                <span style={{color:DIM,fontSize:11}}>▾</span>
            </div>
        );
    }
    return (
        <div style={{maxHeight:200,overflowY:'auto',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.03)'}}>
            {available.map(p => (
                <div key={p.id} onMouseDown={() => { onChange(p.name); setExpanded(false); }}
                    style={{
                        padding:'10px 12px',cursor:'pointer',fontSize:14,
                        color: value.toLowerCase() === p.name.toLowerCase() ? '#f0c040' : '#fff',
                        background: value.toLowerCase() === p.name.toLowerCase() ? 'rgba(240,192,64,0.12)' : '',
                        fontWeight: value.toLowerCase() === p.name.toLowerCase() ? 700 : 400,
                        borderBottom:'1px solid rgba(255,255,255,0.07)'
                    }}
                >{p.name}</div>
            ))}
            <div onMouseDown={() => { setExpanded(false); onCustom(); }}
                style={{padding:'10px 12px',cursor:'pointer',fontSize:14,color:'#42a5f5',
                        borderBottom: presets.length > 0 ? '1px solid rgba(255,255,255,0.07)' : 'none'}}>
                ✏ Custom name...
            </div>
            {presets.length > 0 && (
                <div onMouseDown={() => { setExpanded(false); onEditPresets(); }}
                    style={{padding:'10px 12px',cursor:'pointer',fontSize:14,color:'#ffa726'}}>
                    ⚙ Edit presets...
                </div>
            )}
        </div>
    );
}

function SlotPicker({ names, value, exclude, onChange }) {
    const [expanded, setExpanded] = useState(!value);
    const available = names.filter(n => n !== exclude);
    if (!expanded) {
        return (
            <div onMouseDown={() => setExpanded(true)}
                style={{padding:'10px 12px',borderRadius:8,border:'1px solid rgba(255,255,255,0.15)',background:'rgba(255,255,255,0.05)',cursor:'pointer',fontSize:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:value?'#f0c040':DIM,fontWeight:value?700:400}}>{value || 'Select name...'}</span>
                <span style={{color:DIM,fontSize:11}}>▾</span>
            </div>
        );
    }
    return (
        <div style={{maxHeight:200,overflowY:'auto',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.03)'}}>
            {available.map(n => (
                <div key={n} onMouseDown={() => { onChange(n); setExpanded(false); }}
                    style={{padding:'10px 12px',cursor:'pointer',fontSize:14,
                        color:value===n?'#f0c040':'#fff',background:value===n?'rgba(240,192,64,0.12)':'',
                        fontWeight:value===n?700:400,borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                    {n}
                </div>
            ))}
        </div>
    );
}

export default function Lobby({ onJoined }) {
    const [view, setView] = useState("main"); // main, host, join, scoreboard

    // Host state
    const [hostRoomCode, setHostRoomCode] = useState("");
    const [maxPlayers, setMaxPlayers] = useState("6");
    const [equalStack, setEqualStack] = useState(true);
    const [dualSeat, setDualSeat] = useState(false);
    const [joinName2, setJoinName2] = useState("");
    const [showJoinDropdown2, setShowJoinDropdown2] = useState(false);

    // Join state
    const [joinCode, setJoinCode] = useState("");
    const [joinName, setJoinName] = useState("");
    const [nameLoaded, setNameLoaded] = useState(false);
    const [existingNames, setExistingNames] = useState([]);
    const [nameError, setNameError] = useState("");
    const [expectedNames, setExpectedNames] = useState([]);
    const [showJoinDropdown, setShowJoinDropdown] = useState(false);
    const nameReqRef = useRef(0);
    const pressRef = useRef({ timer: null, didLong: false, moved: false });
    const [activeGames, setActiveGames] = useState([]);
    const [inProgressGames, setInProgressGames] = useState([]);
    const [activeGameModal, setActiveGameModal] = useState(null);
    const [agName1, setAgName1] = useState('');
    const [agName2, setAgName2] = useState('');
    const [agDualSeat, setAgDualSeat] = useState(false);
    const [agJoinError, setAgJoinError] = useState('');

    // Host/load state
    const [wizardStep, setWizardStep] = useState(null); // null | 'name' | 'host_name' | 'second_name'
    const [gameName, setGameName] = useState('');
    const [gameNameError, setGameNameError] = useState('');
    const [wizardHostName, setWizardHostName] = useState('');
    const [wizardHostName2, setWizardHostName2] = useState('');
    const [games, setGames] = useState([]);
    const [loadTarget, setLoadTarget] = useState(null);
    const [showRename, setShowRename] = useState(false);
    const [renameInput, setRenameInput] = useState('');
    const [renameError, setRenameError] = useState('');

    const [error, setError] = useState("");
    const [infoCard, setInfoCard] = useState(null);

    // Scoreboard state
    const [sbEntries, setSbEntries] = useState([]);
    const [sbFilterTab, setSbFilterTab] = useState('all');
    const [sbDetailEntry, setSbDetailEntry] = useState(null);
    const [sbDetailTab, setSbDetailTab] = useState('overview');
    const [showAllTimeStats, setShowAllTimeStats] = useState(false);
    const [expandedAtPlayers, setExpandedAtPlayers] = useState(new Set());

    // Preset state
    const [presets, setPresets] = useState([]);
    const [customTarget, setCustomTarget] = useState(null); // null | 'host1' | 'host2' | 'join1' | 'join2'
    const [customName, setCustomName] = useState('');
    const [customSave, setCustomSave] = useState(false);
    const [customError, setCustomError] = useState('');
    const [showEditPresets, setShowEditPresets] = useState(false);
    const [editSelId, setEditSelId] = useState('');
    const [editName, setEditName] = useState('');
    const [editError, setEditError] = useState('');

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
        setJoinName2('');

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

    // Poll active loaded games AND in-progress games while on join screen
    useEffect(() => {
        if (view !== 'join') return;
        const poll = () => {
            socket.emit('list_active_games', (res) => setActiveGames(res.games || []));
            socket.emit('list_in_progress_games', (res) => setInProgressGames(res.games || []));
        };
        poll();
        const id = setInterval(poll, 7000);
        return () => { clearInterval(id); setActiveGames([]); setInProgressGames([]); };
    }, [view]);

    // Fetch room codes and saved games when entering host screen
    useEffect(() => {
        if (view !== 'host') return;
        setWizardStep(null);
        setGameName('');
        setGameNameError('');
        setWizardHostName('');
        setWizardHostName2('');
        setError('');
        setLoadTarget(null);
        const fetchData = () => {
            socket.emit('get_default_room_codes', (res) => {
                if (res.nextAvailableHostCode) setHostRoomCode(res.nextAvailableHostCode);
            });
            socket.emit('list_games', (res) => { setGames(res.games || []); });
        };
        if (socket.connected) fetchData();
        else socket.once('connect', fetchData);
        return () => { socket.off('connect', fetchData); };
    }, [view]);

    const doHost = () => {
        socket.emit("host_game", {
            name: wizardHostName.trim(),
            secondName: dualSeat ? wizardHostName2.trim() : undefined,
            roomCode: hostRoomCode.trim(),
            maxPlayers: parseInt(maxPlayers),
            equalStack,
            gameName: gameName.trim()
        }, (res) => {
            if (res.success) {
                onJoined(res.roomCode, wizardHostName.trim(), res.playerId, dualSeat ? wizardHostName2.trim() : undefined, res.secondPlayerId);
            } else {
                setError(res.message);
            }
        });
    };

    const doLoadFromTarget = () => {
        if (!wizardHostName.trim()) return setError('Select your name from the original game');
        if (dualSeat && !wizardHostName2.trim()) return setError("Select the second player's name");
        if (dualSeat && wizardHostName.trim().toLowerCase() === wizardHostName2.trim().toLowerCase()) return setError('Both names must be different');
        socket.emit('load_game', {
            saveId: loadTarget.saveId,
            hostName: wizardHostName.trim(),
            secondName: dualSeat ? wizardHostName2.trim() : undefined
        }, (res) => {
            if (res.success) {
                onJoined(res.roomCode, wizardHostName.trim(), res.playerId, dualSeat ? wizardHostName2.trim() : undefined, res.secondPlayerId);
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

    const doAgJoin = () => {
        if (!agName1) return setAgJoinError('Select your name');
        if (agDualSeat && !agName2) return setAgJoinError("Select second player's name");

        if (activeGameModal.type === 'in_progress') {
            socket.emit('sync_reconnect', {
                roomCode: activeGameModal.roomCode,
                playerName: agName1,
                secondName: agDualSeat ? agName2 : undefined
            }, (res) => {
                if (res.success) {
                    onJoined(activeGameModal.roomCode, agName1, res.playerId, agDualSeat ? agName2 : undefined, res.secondPlayerId);
                } else {
                    setAgJoinError(res.reason || 'Could not rejoin');
                }
            });
            return;
        }

        socket.emit('join_loaded_game', {
            roomCode: activeGameModal.roomCode,
            name: agName1,
            secondName: agDualSeat ? agName2 : undefined
        }, (res) => {
            if (res.success) {
                onJoined(activeGameModal.roomCode, agName1, res.playerId, agDualSeat ? agName2 : undefined, res.secondPlayerId);
            } else {
                setAgJoinError(res.message);
            }
        });
    };

    const doRename = () => {
        const trimmed = renameInput.trim();
        if (!trimmed) return setRenameError('Please enter a name');
        socket.emit('rename_save', { saveId: loadTarget.saveId, newName: trimmed }, (res) => {
            if (res.success) {
                setGames(prev => prev.map(g => g.saveId === loadTarget.saveId ? {...g, name: trimmed} : g));
                setLoadTarget(t => ({...t, name: trimmed}));
                setShowRename(false);
            } else {
                const msg = res.message?.startsWith('DUPLICATE_NAME:')
                    ? `A game named '${trimmed}' already exists. Choose a different name.`
                    : (res.message || 'Rename failed');
                setRenameError(msg);
            }
        });
    };

    const doDelete = () => {
        if (!window.confirm(`Delete '${loadTarget.name}'? This cannot be undone.`)) return;
        socket.emit('delete_save', { saveId: loadTarget.saveId }, (res) => {
            if (res.success) {
                setGames(prev => prev.filter(g => g.saveId !== loadTarget.saveId));
                setLoadTarget(null);
            } else {
                setError(res.message || 'Delete failed');
                setLoadTarget(null);
            }
        });
    };

    const handleCardTap = (g) => {
        if (g.isLive) return setError(`"${g.name}" is currently running.`);
        setError('');
        if (!g.hostName) { setWizardHostName(''); setWizardHostName2(''); setLoadTarget(g); return; }
        if (!dualSeat) {
            socket.emit('load_game', { saveId: g.saveId, hostName: g.hostName }, (res) => {
                if (res.success) { onJoined(res.roomCode, g.hostName, res.playerId); }
                else { setError(res.message || 'Could not load game'); }
            });
        } else {
            setWizardHostName(g.hostName); setWizardHostName2(''); setLoadTarget(g);
        }
    };
    const startPress = (g) => {
        const pr = pressRef.current;
        pr.didLong = false; pr.moved = false;
        pr.timer = setTimeout(() => { pr.didLong = true; setInfoCard(g); }, 500);
    };
    const endPress = (g) => {
        const pr = pressRef.current;
        if (pr.timer) { clearTimeout(pr.timer); pr.timer = null; }
        if (!pr.didLong && !pr.moved) handleCardTap(g);
        pr.didLong = false; pr.moved = false;
    };
    const cancelPress = () => {
        const pr = pressRef.current;
        if (pr.timer) { clearTimeout(pr.timer); pr.timer = null; }
        pr.moved = true;
    };

    const phaseLabel = (p) => {
        if (!p) return null;
        if (p === 'preflop' || p === 'preflop_start') return 'Preflop';
        if (p === 'flop' || p === 'flop_reveal') return 'Flop';
        if (p === 'turn' || p === 'turn_reveal') return 'Turn';
        if (p === 'river' || p === 'river_reveal') return 'River';
        if (p === 'showdown') return 'Showdown';
        if (p === 'session_end') return 'Session End';
        if (p === 'end') return 'Game Over';
        return null;
    };

    useEffect(() => {
        if (view !== 'scoreboard') return;
        socket.emit('list_scoreboard', (res) => setSbEntries(res.entries || []));
    }, [view]);

    useEffect(() => {
        socket.emit('list_presets', (res) => {
            if (res.success) setPresets(res.presets);
        });
    }, []);

    const formatDate = (iso) => {
        try { 
            const d = new Date(iso);
            return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        } catch(e) { return iso; }
    };

    const doCustomConfirm = () => {
        const trimmed = customName.trim();
        if (trimmed.length < 3 || trimmed.length > 9) return setCustomError('Name must be 3–9 characters');
        const isLoad2 = customTarget === 'load2';
        if (customTarget === 'wizard1') setWizardHostName(trimmed);
        else if (customTarget === 'wizard2') setWizardHostName2(trimmed);
        else if (customTarget === 'join1') { setJoinName(trimmed); setNameError(''); }
        else if (customTarget === 'join2') setJoinName2(trimmed);
        if (customSave) {
            socket.emit('add_preset', { name: trimmed }, (res) => {
                if (res.success) {
                    setPresets(prev => [...prev, { id: res.id, name: trimmed }].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
                }
            });
        }
        setCustomTarget(null);
        setCustomName('');
        setCustomSave(false);
        setCustomError('');
        if (isLoad2) {
            socket.emit('load_game', { saveId: loadTarget.saveId, hostName: wizardHostName, secondName: trimmed }, (res) => {
                if (res.success) { onJoined(res.roomCode, wizardHostName, res.playerId, trimmed, res.secondPlayerId); }
                else { setError(res.message || 'Could not load game'); }
            });
        }
    };

    const doRenamePreset = () => {
        const trimmed = editName.trim();
        if (trimmed.length < 3 || trimmed.length > 9) return setEditError('Name must be 3–9 characters');
        socket.emit('rename_preset', { presetId: editSelId, newName: trimmed }, (res) => {
            if (res.success) {
                setPresets(prev => prev.map(p => p.id === editSelId ? { ...p, name: trimmed } : p).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
                setEditName(trimmed);
                setEditError('');
            } else {
                setEditError(res.message || 'Rename failed');
            }
        });
    };

    const doDeletePreset = () => {
        socket.emit('delete_preset', { presetId: editSelId }, (res) => {
            if (res.success) {
                setPresets(prev => prev.filter(p => p.id !== editSelId));
                setEditSelId('');
                setEditName('');
                setEditError('');
            } else {
                setEditError(res.message || 'Delete failed');
            }
        });
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
                            <Btn full onClick={() => { setView("host"); setError(""); }}>Host / Load Game</Btn>
                            <Btn full bg="#1976d2" onClick={() => { setView("join"); setError(""); }}>Join Game</Btn>
                            <Btn full bg="#4a3728" onClick={() => setView("scoreboard")}>🏆 Scoreboard</Btn>
                        </div>
                    )}

                    {view === "host" && (
                        <div style={{textAlign:"left"}}>
                            {/* Header: back + title + universal 2-seat toggle */}
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                                <button onClick={()=>setView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>
                                <span style={{color:G,fontWeight:700,fontSize:15}}>Host / Load</span>
                                <div style={{flex:1}}/>
                                <button
                                    onClick={()=>{setWizardStep('name');setGameName('');setGameNameError('');setWizardHostName('');setWizardHostName2('');}}
                                    style={{color:'#fff',fontSize:18,fontWeight:700,cursor:'pointer',padding:'5px 12px',borderRadius:8,background:'#2e7d32',border:'none',lineHeight:1,marginRight:6}}>+</button>
                                <button
                                    onClick={()=>{setDualSeat(d=>!d);setWizardHostName2('');}}
                                    style={{
                                        color:dualSeat?G:DIM,
                                        fontSize:12,
                                        cursor:'pointer',
                                        padding:'6px 14px',
                                        borderRadius:20,
                                        background:dualSeat?'rgba(240,192,64,0.18)':'rgba(255,255,255,0.07)',
                                        border:dualSeat?'1px solid rgba(240,192,64,0.5)':'1px solid rgba(255,255,255,0.15)',
                                        boxShadow:dualSeat?'0 0 8px rgba(240,192,64,0.35)':'none',
                                        fontWeight:600,
                                        userSelect:'none'
                                    }}
                                >2 seats</button>
                            </div>

                            {/* Card list */}
                            {wizardStep === null && (
                                <>
                                    {games.length === 0 ? (
                                        <div style={{textAlign:'center',padding:'24px 0',color:DIM,fontSize:13}}>No saved games yet.</div>
                                    ) : (
                                        <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:340,overflowY:'auto'}}>
                                            {games.map(g => (
                                                <div key={g.saveId}
                                                    onTouchStart={() => startPress(g)}
                                                    onTouchEnd={e => { e.preventDefault(); endPress(g); }}
                                                    onTouchCancel={cancelPress}
                                                    onTouchMove={cancelPress}
                                                    onMouseDown={() => startPress(g)}
                                                    onMouseUp={() => endPress(g)}
                                                    onMouseLeave={cancelPress}
                                                    style={{
                                                        background:g.completionStatus==='completed'?'rgba(76,175,80,0.07)':'rgba(255,255,255,0.05)',
                                                        border:g.isLive?'1px solid rgba(33,150,243,0.5)':g.completionStatus==='completed'?'1px solid rgba(76,175,80,0.2)':'1px solid rgba(255,255,255,0.1)',
                                                        borderRadius:10,padding:'11px 14px',cursor:g.isLive?'default':'pointer',WebkitTapHighlightColor:'transparent'
                                                    }}>
                                                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:3}}>
                                                        <span style={{color:'#fff',fontWeight:700,fontSize:14}}>{g.name}</span>
                                                        {g.isLive
                                                            ? <span style={{color:'#64b5f6',fontSize:11,fontWeight:700}}>● LIVE</span>
                                                            : g.completionStatus==='completed'
                                                                ? <span style={{color:'#4caf50',fontSize:11,fontWeight:600}}>✓ Done</span>
                                                                : null}
                                                    </div>
                                                    {g.hostName && <div style={{color:DIM,fontSize:11,marginBottom:2}}>Hosted by {g.hostName}</div>}
                                                    <div style={{color:DIM,fontSize:12}}>Session {g.sessionNumber} · Hand #{g.handNumber} · {g.playerCount} players</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Wizard step 1: name + config */}
                            {wizardStep === 'name' && (
                                <div>
                                    <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Game Name</div>
                                    <input value={gameName} onChange={e=>{setGameName(e.target.value);setGameNameError('');}}
                                        placeholder="e.g. Friday Night Poker"
                                        style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:gameNameError?4:12}}
                                    />
                                    {gameNameError && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:8}}>{gameNameError}</div>}
                                    <Fld lbl="Max Players (2–10)" val={maxPlayers} ch={e=>setMaxPlayers(e.target.value)} type="number" />
                                    <div style={{marginBottom:14}}>
                                        <label style={{color:"#fff",fontSize:14,display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                                            <input type="checkbox" checked={equalStack} onChange={e=>setEqualStack(e.target.checked)} style={{width:18,height:18}}/>
                                            Equal opening stack for all
                                        </label>
                                    </div>
                                    <Fld lbl="Room Code (1–9)" val={hostRoomCode} ch={e=>setHostRoomCode(e.target.value)} type="number" />
                                    <div style={{display:'flex',gap:10,marginTop:4}}>
                                        <Btn full bg="rgba(255,255,255,0.08)" onClick={()=>setWizardStep(null)}>Back</Btn>
                                        <Btn full onClick={()=>{
                                            const n=gameName.trim();
                                            if (!n) return setGameNameError('Please enter a game name');
                                            const mp=parseInt(maxPlayers);
                                            if (isNaN(mp)||mp<2||mp>10) return setError('Max players must be 2–10');
                                            if (!/^[1-9]$/.test(hostRoomCode.trim())) return setError('Room code must be a single digit 1–9');
                                            setWizardStep('host_name');
                                        }}>Next</Btn>
                                    </div>
                                </div>
                            )}

                            {/* Wizard step 2: your name */}
                            {wizardStep === 'host_name' && (
                                <div>
                                    <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                                    <NamePicker presets={presets} value={wizardHostName}
                                        excludeNames={dualSeat?[wizardHostName2]:[]}
                                        onChange={setWizardHostName}
                                        onCustom={()=>{setCustomTarget('wizard1');setCustomName('');setCustomSave(false);setCustomError('');}}
                                        onEditPresets={()=>{setShowEditPresets(true);setEditSelId('');setEditName('');setEditError('');}}
                                    />
                                    <div style={{display:'flex',gap:10,marginTop:12}}>
                                        <Btn full bg="rgba(255,255,255,0.08)" onClick={()=>setWizardStep('name')}>Back</Btn>
                                        <Btn full onClick={()=>{
                                            if (!wizardHostName.trim()) return setError('Please enter your name');
                                            if (dualSeat) setWizardStep('second_name'); else doHost();
                                        }}>{dualSeat?'Next':'Create Room'}</Btn>
                                    </div>
                                </div>
                            )}

                            {/* Wizard step 3: second player (only when dualSeat) */}
                            {wizardStep === 'second_name' && (
                                <div>
                                    <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Second Player's Name</div>
                                    <NamePicker presets={presets} value={wizardHostName2}
                                        excludeNames={[wizardHostName]}
                                        onChange={setWizardHostName2}
                                        onCustom={()=>{setCustomTarget('wizard2');setCustomName('');setCustomSave(false);setCustomError('');}}
                                        onEditPresets={()=>{setShowEditPresets(true);setEditSelId('');setEditName('');setEditError('');}}
                                    />
                                    <div style={{display:'flex',gap:10,marginTop:12}}>
                                        <Btn full bg="rgba(255,255,255,0.08)" onClick={()=>setWizardStep('host_name')}>Back</Btn>
                                        <Btn full onClick={()=>{
                                            if (!wizardHostName2.trim()) return setError("Please enter the second player's name");
                                            if (wizardHostName.trim().toLowerCase()===wizardHostName2.trim().toLowerCase()) return setError('Both names must be different');
                                            doHost();
                                        }}>Create Room</Btn>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {view === "join" && (
                        <div style={{textAlign:"left"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                                <button onClick={()=>setView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>
                                <span style={{color:G,fontWeight:700,fontSize:15}}>Join Room</span>
                                <div style={{flex:1}}/>
                                <button
                                    onClick={() => { setAgDualSeat(d => !d); setAgName2(''); }}
                                    style={{
                                        color:agDualSeat?G:DIM,fontSize:12,cursor:'pointer',
                                        padding:'6px 14px',borderRadius:20,
                                        background:agDualSeat?'rgba(240,192,64,0.18)':'rgba(255,255,255,0.07)',
                                        border:agDualSeat?'1px solid rgba(240,192,64,0.5)':'1px solid rgba(255,255,255,0.15)',
                                        boxShadow:agDualSeat?'0 0 8px rgba(240,192,64,0.35)':'none',
                                        fontWeight:600,userSelect:'none'
                                    }}
                                >2 seats</button>
                            </div>
                            {activeGames.length > 0 && (
                                <div style={{marginBottom:16}}>
                                    <div style={{color:G,fontWeight:700,fontSize:13,marginBottom:8}}>Active Games</div>
                                    {activeGames.map(g => (
                                        <div key={g.roomCode}
                                            onMouseDown={() => {
                                const names = g.openNames;
                                if (!names.length) return;
                                if (names.length === 1) {
                                    socket.emit('join_loaded_game', { roomCode: g.roomCode, name: names[0] }, (res) => {
                                        if (res.success) { onJoined(g.roomCode, names[0], res.playerId); }
                                        else { setError(res.message || 'Could not join'); }
                                    });
                                } else if (names.length === 2 && agDualSeat) {
                                    socket.emit('join_loaded_game', { roomCode: g.roomCode, name: names[0], secondName: names[1] }, (res) => {
                                        if (res.success) { onJoined(g.roomCode, names[0], res.playerId, names[1], res.secondPlayerId); }
                                        else { setError(res.message || 'Could not join'); }
                                    });
                                } else {
                                    setActiveGameModal(g); setAgName1(''); setAgName2(''); setAgJoinError('');
                                }
                            }}
                                            style={{background:'rgba(240,192,64,0.08)',border:'1px solid rgba(240,192,64,0.25)',borderRadius:10,padding:'10px 12px',marginBottom:8,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}
                                        >
                                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4}}>
                                                <span style={{color:'#fff',fontWeight:700,fontSize:15}}>{g.saveName || 'Unnamed Save'}</span>
                                                <span style={{color:DIM,fontSize:12}}>#{g.roomCode}</span>
                                            </div>
                                            <div style={{color:DIM,fontSize:12,marginBottom:g.filledNames.length ? 4 : 0}}>
                                                {g.filledNames.length}/{g.totalSeats} seats filled
                                            </div>
                                            {g.filledNames.length > 0 && (
                                                <div style={{color:'rgba(255,255,255,0.4)',fontSize:11}}>
                                                    Joined: {g.filledNames.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {inProgressGames.length > 0 && (
                                <div style={{marginBottom:16}}>
                                    <div style={{color:'#64b5f6',fontWeight:700,fontSize:13,marginBottom:8}}>In Progress</div>
                                    {inProgressGames.map(g => (
                                        <div key={g.roomCode}
                                            onMouseDown={() => {
                                const names = g.disconnectedNames;
                                if (!names.length) return;
                                if (names.length === 1) {
                                    socket.emit('sync_reconnect', { roomCode: g.roomCode, playerName: names[0] }, (res) => {
                                        if (res.success) { onJoined(g.roomCode, names[0], res.playerId); }
                                        else { setError(res.reason || 'Could not rejoin'); }
                                    });
                                } else if (names.length === 2 && agDualSeat) {
                                    socket.emit('sync_reconnect', { roomCode: g.roomCode, playerName: names[0], secondName: names[1] }, (res) => {
                                        if (res.success) { onJoined(g.roomCode, names[0], res.playerId, names[1], res.secondPlayerId); }
                                        else { setError(res.reason || 'Could not rejoin'); }
                                    });
                                } else {
                                    setActiveGameModal({...g, type:'in_progress'}); setAgName1(''); setAgName2(''); setAgJoinError('');
                                }
                            }}
                                            style={{background:'rgba(33,150,243,0.08)',border:'1px solid rgba(33,150,243,0.25)',borderRadius:10,padding:'10px 12px',marginBottom:8,cursor:'pointer',WebkitTapHighlightColor:'transparent'}}
                                        >
                                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4}}>
                                                <span style={{color:'#fff',fontWeight:700,fontSize:15}}>{g.saveName || 'Live Game'}</span>
                                                <span style={{color:DIM,fontSize:12}}>#{g.roomCode}</span>
                                            </div>
                                            <div style={{color:DIM,fontSize:12,marginBottom:4}}>
                                                Session {g.sessionNumber}{g.totalSessions ? '/' + g.totalSessions : ''} · Hand #{g.handNumber}
                                            </div>
                                            <div style={{color:'rgba(100,181,246,0.7)',fontSize:11}}>Away: {g.disconnectedNames.join(', ')}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {activeGames.length === 0 && inProgressGames.length === 0 && (
                                <div style={{color:DIM,fontSize:12,marginBottom:14}}>No active games. Enter a code below to join.</div>
                            )}
                            <Fld lbl="Room Code" val={joinCode} ch={handleCodeChange} type="number" />
                            <div style={{color:DIM,fontSize:11,marginTop:-8,marginBottom:10}}>1 digit = new game, 2 digits = loaded game</div>
                            {joinCode.length === 2 ? (
                                <div style={{marginBottom:14,position:'relative'}}>
                                    <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                                    <input
                                        value={joinName}
                                        onChange={handleJoinNameChange}
                                        onFocus={() => { if (expectedNames.length > 0) setShowJoinDropdown(true); }}
                                        onBlur={() => setShowJoinDropdown(false)}
                                        placeholder="Your original name"
                                        style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none'}}
                                    />
                                    {showJoinDropdown && expectedNames.length > 0 && (
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
                            ) : (
                                <div style={{marginBottom:14}}>
                                    <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                                    <NamePicker
                                        presets={presets} value={joinName}
                                        excludeNames={[...existingNames, ...(dualSeat ? [joinName2] : [])]}
                                        onChange={n => { setJoinName(n); setNameError(''); }}
                                        onCustom={() => { setCustomTarget('join1'); setCustomName(''); setCustomSave(false); setCustomError(''); }}
                                        onEditPresets={() => { setShowEditPresets(true); setEditSelId(''); setEditName(''); setEditError(''); }}
                                    />
                                </div>
                            )}
                            <div style={{marginBottom: dualSeat ? 10 : 0, marginTop:4}}>
                                <label style={{color:DIM, fontSize:13, display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none'}}>
                                    <input type="checkbox" checked={dualSeat} onChange={e => { setDualSeat(e.target.checked); setJoinName2(''); }} style={{width:16, height:16, accentColor:'#f0c040'}} />
                                    Play 2 players from this device
                                </label>
                            </div>
                            {dualSeat && (
                                joinCode.length === 2 ? (
                                    <div style={{marginBottom:14, position:'relative'}}>
                                        <div style={{color:'rgba(255,255,255,0.5)', fontSize:12, marginBottom:5, fontWeight:600}}>Second Player's Name</div>
                                        <input
                                            value={joinName2}
                                            onChange={e => setJoinName2(e.target.value)}
                                            onFocus={() => { if (expectedNames.length > 0) setShowJoinDropdown2(true); }}
                                            onBlur={() => setShowJoinDropdown2(false)}
                                            placeholder="Their original name"
                                            style={{width:'100%', padding:'10px 12px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'#fff', fontSize:14, boxSizing:'border-box', outline:'none'}}
                                        />
                                        {showJoinDropdown2 && expectedNames.length > 0 && (
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
                                ) : (
                                    <div style={{marginBottom:14}}>
                                        <div style={{color:'rgba(255,255,255,0.5)', fontSize:12, marginBottom:5, fontWeight:600}}>Second Player's Name</div>
                                        <NamePicker
                                            presets={presets} value={joinName2}
                                            excludeNames={[...existingNames, joinName]}
                                            onChange={setJoinName2}
                                            onCustom={() => { setCustomTarget('join2'); setCustomName(''); setCustomSave(false); setCustomError(''); }}
                                            onEditPresets={() => { setShowEditPresets(true); setEditSelId(''); setEditName(''); setEditError(''); }}
                                        />
                                    </div>
                                )
                            )}
                            {nameError && <div style={{color:"#ff6b6b",fontSize:12,marginTop:-8,marginBottom:10,paddingLeft:2}}>{nameError}</div>}
                            <Btn full dis={!!nameError} onClick={doJoin}>Connect to Table</Btn>
                        </div>
                    )}


                    {view === "scoreboard" && (
                        <div style={{textAlign:"left"}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                                <button onClick={()=>setView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>
                                <span style={{color:G,fontWeight:700,fontSize:15}}>Scoreboard</span>
                            </div>
                            <button onClick={()=>{setShowAllTimeStats(true);setExpandedAtPlayers(new Set());}} style={{width:'100%',background:'rgba(33,150,243,0.12)',border:'1px solid rgba(33,150,243,0.25)',color:'#64b5f6',borderRadius:10,padding:'9px 0',fontSize:13,fontWeight:700,cursor:'pointer',marginBottom:14}}>
                                📊 All-Time Stats
                            </button>
                            <div style={{display:"flex",gap:8,marginBottom:16}}>
                                {['all','in_progress','completed','terminated'].map(tab => (
                                    <button key={tab} onClick={()=>setSbFilterTab(tab)}
                                        style={{flex:1,padding:'7px 0',borderRadius:8,border:'1px solid rgba(255,255,255,0.15)',background:sbFilterTab===tab?'rgba(240,192,64,0.2)':'rgba(255,255,255,0.05)',color:sbFilterTab===tab?G:'rgba(255,255,255,0.5)',fontSize:12,fontWeight:sbFilterTab===tab?700:400,cursor:'pointer'}}>
                                        {tab==='all'?'All':tab==='in_progress'?'In Progress':tab==='completed'?'Completed':'Terminated'}
                                    </button>
                                ))}
                            </div>
                            {(() => {
                                const filtered = sbEntries.filter(e => sbFilterTab === 'all' || e.completionStatus === sbFilterTab);
                                if (filtered.length === 0) return (
                                    <div style={{textAlign:"center",padding:30,color:DIM}}>
                                        <div style={{fontSize:36,marginBottom:10}}>🏆</div>
                                        {sbEntries.length === 0
                                            ? 'No games yet. Save a named game to start tracking.'
                                            : 'No ' + (sbFilterTab === 'in_progress' ? 'in-progress' : sbFilterTab === 'terminated' ? 'terminated' : 'completed') + ' games.'}
                                    </div>
                                );
                                return (
                                    <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:380,overflowY:"auto"}}>
                                        {filtered.map(e => {
                                            const isCompleted = e.completionStatus === 'completed';
                                            const players = e.gameState?.players || [];
                                            const scores = e.scores || {};
                                            let leaderName = null;
                                            if (!isCompleted) {
                                                let maxScore = 0, leaderId = null;
                                                for (const [id, score] of Object.entries(scores)) {
                                                    if (score > maxScore) { maxScore = score; leaderId = id; }
                                                }
                                                if (leaderId) leaderName = players.find(p => p.id === leaderId)?.name || null;
                                            }
                                            return (
                                                <div key={e.id} onClick={()=>{setSbDetailEntry(e);setSbDetailTab('overview');}} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"12px 14px",cursor:'pointer'}}>
                                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                                                        <span style={{fontWeight:700,fontSize:14,color:"#fff"}}>{e.name}</span>
                                                        <span style={{fontSize:11,fontWeight:600,color:isCompleted?'#4caf50':e.completionStatus==='terminated'?'#ef5350':'#f0c040',marginLeft:8,whiteSpace:'nowrap'}}>
                                                            {isCompleted ? '✓ Completed' : e.completionStatus === 'terminated' ? '⊗ Terminated' : '● In Progress'}
                                                        </span>
                                                    </div>
                                                    <div style={{color:DIM,fontSize:12,marginBottom:3}}>{(e.playerNames||[]).join(', ')}</div>
                                                    <div style={{color:DIM,fontSize:12,marginBottom:3}}>
                                                        {isCompleted
                                                            ? (e.winner ? 'Winner: ' + e.winner : '—')
                                                            : (leaderName ? 'Leading: ' + leaderName : '—')}
                                                    </div>
                                                    <div style={{color:DIM,fontSize:12,marginBottom:3}}>
                                                        Session {e.sessionsCompleted}{e.totalSessions ? ' of ' + e.totalSessions : ''} · {e.totalHands} hand{e.totalHands!==1?'s':''}
                                                    </div>
                                                    <div style={{color:DIM,fontSize:11}}>Updated {formatDate(e.lastUpdatedAt)}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                </Card>
            </div>
            {loadTarget && showRename && (
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
            {loadTarget && !showRename && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>{setLoadTarget(null);setError('');}}>
                    <div style={{background:'#1a0f0a',borderRadius:'20px 20px 0 0',padding:'24px 20px 32px',width:'100%',maxWidth:460,maxHeight:'85vh',overflowY:'auto',position:'relative'}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>{setLoadTarget(null);setError('');}} style={{position:'absolute',top:16,right:16,background:'none',border:'none',color:DIM,fontSize:22,cursor:'pointer',padding:0,lineHeight:1}}>✕</button>
                        <div style={{color:G,fontWeight:800,fontSize:20,marginBottom:4,paddingRight:36}}>{loadTarget.name}</div>
                        {loadTarget.hostName && <div style={{color:DIM,fontSize:12,marginBottom:4}}>Hosted by {loadTarget.hostName}</div>}
                        <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:16}}>
                            Session {loadTarget.sessionNumber}{loadTarget.cfg?.sessions?' of '+loadTarget.cfg.sessions:''} · Hand #{loadTarget.handNumber} · {loadTarget.playerCount} players
                        </div>
                        {loadTarget.hostName ? (
                            <>
                                <div style={{color:DIM,fontSize:13,marginBottom:12}}>Host: <span style={{color:'#fff',fontWeight:700}}>{wizardHostName}</span></div>
                                <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:6,fontWeight:600}}>Second Player's Name</div>
                                <NamePicker presets={presets} value={wizardHostName2}
                                    excludeNames={[wizardHostName]}
                                    onChange={(name) => {
                                        socket.emit('load_game', { saveId: loadTarget.saveId, hostName: wizardHostName, secondName: name }, (res) => {
                                            if (res.success) { onJoined(res.roomCode, wizardHostName, res.playerId, name, res.secondPlayerId); }
                                            else { setError(res.message || 'Could not load game'); }
                                        });
                                    }}
                                    onCustom={() => { setCustomTarget('load2'); setCustomName(''); setCustomSave(false); setCustomError(''); }}
                                    onEditPresets={() => { setShowEditPresets(true); setEditSelId(''); setEditName(''); setEditError(''); }}
                                />
                            </>
                        ) : (
                            <>
                                <div style={{marginBottom:12}}>
                                    <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                                    <select value={wizardHostName} onChange={e=>{setWizardHostName(e.target.value);setError('');}}
                                        style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:wizardHostName?'#fff':DIM,fontSize:14,boxSizing:'border-box',outline:'none',appearance:'none'}}>
                                        <option value="">Select your name</option>
                                        {(loadTarget.playerNames||[]).filter(n=>n!==wizardHostName2).map(n=><option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                                {dualSeat && (
                                    <div style={{marginBottom:12}}>
                                        <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Second Player's Name</div>
                                        <select value={wizardHostName2} onChange={e=>{setWizardHostName2(e.target.value);setError('');}}
                                            style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:wizardHostName2?'#fff':DIM,fontSize:14,boxSizing:'border-box',outline:'none',appearance:'none'}}>
                                            <option value="">Select second player's name</option>
                                            {(loadTarget.playerNames||[]).filter(n=>n!==wizardHostName).map(n=><option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div style={{marginBottom:10}}><Btn full bg="#2e7d32" onClick={doLoadFromTarget}>Load Game</Btn></div>
                            </>
                        )}
                        {error && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:10}}>{error}</div>}
                        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
                            <button onClick={()=>{setRenameInput(loadTarget.name);setRenameError('');setShowRename(true);}} style={{width:44,background:'rgba(255,255,255,0.09)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:10,color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0}}>✏️</button>
                            <button onClick={doDelete} style={{width:44,background:'rgba(160,0,0,0.35)',border:'1px solid rgba(180,0,0,0.4)',borderRadius:10,color:'#fff',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0}}>🗑</button>
                        </div>
                    </div>
                </div>
            )}
            {infoCard && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setInfoCard(null)}>
                    <div style={{background:'#1a0f0a',borderRadius:'20px 20px 0 0',padding:'24px 20px 32px',width:'100%',maxWidth:460,maxHeight:'85vh',overflowY:'auto',position:'relative'}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>setInfoCard(null)} style={{position:'absolute',top:16,right:16,background:'none',border:'none',color:DIM,fontSize:22,cursor:'pointer',padding:0,lineHeight:1}}>✕</button>
                        <div style={{color:G,fontWeight:800,fontSize:20,marginBottom:4,paddingRight:36}}>{infoCard.name}</div>
                        {infoCard.hostName && <div style={{color:DIM,fontSize:12,marginBottom:4}}>Hosted by {infoCard.hostName}</div>}
                        <div style={{display:'flex',alignItems:'center',marginBottom:12}}>
                            {infoCard.isLive
                                ? <span style={{color:'#64b5f6',fontSize:12,fontWeight:700}}>● LIVE</span>
                                : infoCard.completionStatus==='completed'
                                    ? <span style={{color:'#4caf50',fontSize:12,fontWeight:600}}>✓ Done</span>
                                    : <span style={{color:G,fontSize:12,fontWeight:600}}>● In Progress</span>}
                        </div>
                        <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:16}}>
                            Session {infoCard.sessionNumber}{infoCard.cfg?.sessions?' of '+infoCard.cfg.sessions:''} · Hand #{infoCard.handNumber}{phaseLabel(infoCard.phase)?' · '+phaseLabel(infoCard.phase):''}
                        </div>
                        {(() => {
                            const stacks = infoCard.stacks || [];
                            const scores = infoCard.scores || {};
                            const sorted = stacks.map(p => ({...p, score: scores[p.id] || 0})).sort((a,b) => b.score - a.score);
                            const hasScores = sorted.some(p => p.score !== 0);
                            const medalMap = hasScores ? computeMedal(sorted) : new Map();
                            if (!sorted.length) return null;
                            return (
                                <div>
                                    <div style={{color:'rgba(255,255,255,0.45)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Players</div>
                                    {sorted.map(p => (
                                        <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                            <span style={{color:'#fff',fontSize:14}}>{hasScores ? (medalMap.get(p) ? medalMap.get(p)+' ' : '') : ''}{p.name}</span>
                                            <div style={{display:'flex',gap:10,alignItems:'center'}}>
                                                <span style={{color:DIM,fontSize:12}}>Stack: {p.stack?.toLocaleString() ?? '—'}</span>
                                                {hasScores && <span style={{color:G,fontSize:13,fontWeight:700}}>{p.score>0?'+':''}{p.score.toLocaleString()} pts</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
            {activeGameModal && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.80)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={() => { setActiveGameModal(null); setAgName1(''); setAgName2(''); setAgJoinError(''); }}>
                    <div style={{background:'#1a0f0a',borderRadius:16,padding:24,width:'100%',maxWidth:420,maxHeight:'85vh',overflowY:'auto',position:'relative'}} onClick={e=>e.stopPropagation()}>
                        <button onClick={() => { setActiveGameModal(null); setAgName1(''); setAgName2(''); setAgJoinError(''); }} style={{position:'absolute',top:16,right:16,background:'none',border:'none',color:DIM,fontSize:22,cursor:'pointer',padding:0,lineHeight:1}}>✕</button>
                        <div style={{color:G,fontWeight:800,fontSize:20,marginBottom:4,paddingRight:36}}>{activeGameModal.saveName || 'Unnamed Save'}</div>
                        <div style={{color:DIM,fontSize:12,marginBottom:8}}>#{activeGameModal.roomCode}</div>
                        <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:8}}>
                            Session {activeGameModal.sessionNumber}{activeGameModal.totalSessions ? ' of ' + activeGameModal.totalSessions : ''} · Hand #{activeGameModal.handNumber}{phaseLabel(activeGameModal.phase) ? ' · ' + phaseLabel(activeGameModal.phase) : ''}
                        </div>
                        {activeGameModal.type !== 'in_progress' && activeGameModal.filledNames?.length > 0 && (
                            <div style={{color:DIM,fontSize:12,marginBottom:16}}>Already joined: {activeGameModal.filledNames.join(', ')}</div>
                        )}
                        {activeGameModal.type === 'in_progress' && (
                            <div style={{color:'rgba(100,181,246,0.7)',fontSize:12,marginBottom:16}}>Away: {activeGameModal.disconnectedNames.join(', ')}</div>
                        )}
                        {(() => {
                            const scored = (activeGameModal.playerNames || [])
                                .map(p => ({ name: p.name, score: (activeGameModal.scores || {})[p.id] || 0 }))
                                .sort((a, b) => b.score - a.score);
                            if (!scored.some(p => p.score !== 0)) return null;
                            const medalMap = computeMedal(scored);
                            return (
                                <div style={{marginBottom:16}}>
                                    <div style={{color:'rgba(255,255,255,0.45)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Cumulative Scores</div>
                                    {scored.map(p => (
                                        <div key={p.name} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                            <span style={{color:'#fff',fontSize:14}}>{medalMap.get(p)} {p.name}</span>
                                            <span style={{color:G,fontSize:13,fontWeight:700}}>{p.score > 0 ? '+' : ''}{p.score.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                        <div style={{marginBottom:12}}>
                            <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Your Name</div>
                            <SlotPicker
                                names={activeGameModal.type === 'in_progress' ? activeGameModal.disconnectedNames : activeGameModal.openNames}
                                value={agName1} exclude={agName2}
                                onChange={v => {
                                    if (agDualSeat) {
                                        setAgName1(v); if (v === agName2) setAgName2(''); setAgJoinError('');
                                    } else if (activeGameModal.type === 'in_progress') {
                                        socket.emit('sync_reconnect', { roomCode: activeGameModal.roomCode, playerName: v }, (res) => {
                                            if (res.success) { onJoined(activeGameModal.roomCode, v, res.playerId); }
                                            else { setAgJoinError(res.reason || 'Could not rejoin'); }
                                        });
                                    } else {
                                        socket.emit('join_loaded_game', { roomCode: activeGameModal.roomCode, name: v }, (res) => {
                                            if (res.success) { onJoined(activeGameModal.roomCode, v, res.playerId); }
                                            else { setAgJoinError(res.message || 'Could not join'); }
                                        });
                                    }
                                }}
                            />
                        </div>
                        {agDualSeat && agName1 && (
                            <div style={{marginBottom:16}}>
                                <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:5,fontWeight:600}}>Second Player's Name</div>
                                <SlotPicker
                                    names={activeGameModal.type === 'in_progress' ? activeGameModal.disconnectedNames : activeGameModal.openNames}
                                    value={agName2} exclude={agName1}
                                    onChange={v => {
                                        if (activeGameModal.type === 'in_progress') {
                                            socket.emit('sync_reconnect', { roomCode: activeGameModal.roomCode, playerName: agName1, secondName: v }, (res) => {
                                                if (res.success) { onJoined(activeGameModal.roomCode, agName1, res.playerId, v, res.secondPlayerId); }
                                                else { setAgJoinError(res.reason || 'Could not rejoin'); }
                                            });
                                        } else {
                                            socket.emit('join_loaded_game', { roomCode: activeGameModal.roomCode, name: agName1, secondName: v }, (res) => {
                                                if (res.success) { onJoined(activeGameModal.roomCode, agName1, res.playerId, v, res.secondPlayerId); }
                                                else { setAgJoinError(res.message || 'Could not join'); }
                                            });
                                        }
                                    }}
                                />
                            </div>
                        )}
                        {agJoinError && <div style={{color:'#f44',fontSize:13,marginBottom:12}}>{agJoinError}</div>}
                    </div>
                </div>
            )}
            {sbDetailEntry && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:310,display:'flex',alignItems:'flex-end',justifyContent:'center'}} onClick={()=>setSbDetailEntry(null)}>
                    <div style={{background:'#1a0f0a',borderRadius:'20px 20px 0 0',padding:'24px 20px 32px',width:'100%',maxWidth:460,maxHeight:'85vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                            <div style={{flex:1,marginRight:12}}>
                                <div style={{color:G,fontWeight:800,fontSize:18,lineHeight:1.2}}>{sbDetailEntry.name}</div>
                                {sbDetailEntry.originalName !== sbDetailEntry.name && (
                                    <div style={{color:DIM,fontSize:12,marginTop:2}}>Originally "{sbDetailEntry.originalName}"</div>
                                )}
                            </div>
                            <button onClick={()=>setSbDetailEntry(null)} style={{background:'none',border:'none',color:DIM,fontSize:22,cursor:'pointer',padding:0,lineHeight:1,flexShrink:0}}>✕</button>
                        </div>
                        <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,0.1)',marginBottom:16,marginTop:12}}>
                            {['overview','breakdown','stats'].map(tab => (
                                <button key={tab} onClick={()=>setSbDetailTab(tab)} style={{flex:1,background:'none',border:'none',padding:'8px 0',fontSize:13,fontWeight:700,cursor:'pointer',color:sbDetailTab===tab?G:DIM,borderBottom:sbDetailTab===tab?`2px solid ${G}`:'2px solid transparent'}}>
                                    {tab==='overview'?'Overview':tab==='breakdown'?'Breakdown':'Stats'}
                                </button>
                            ))}
                        </div>
                        {sbDetailTab === 'overview' && (() => {
                            const ent = sbDetailEntry;
                            const isCompleted = ent.completionStatus === 'completed';
                            const isTerminated = ent.completionStatus === 'terminated';
                            const players = ent.gameState?.players || [];
                            const scores = ent.scores || {};
                            const scored = players.map(p => ({...p, score: scores[p.id] || 0})).sort((a,b) => b.score - a.score);
                            const medalMap = computeMedal(scored);
                            return (
                                <div>
                                    <div style={{marginBottom:12}}>
                                        <span style={{fontSize:12,fontWeight:600,color:isCompleted?'#4caf50':isTerminated?'#ef5350':'#f0c040'}}>
                                            {isCompleted ? '✓ Completed' : isTerminated ? '⊗ Terminated' : '● In Progress'}
                                        </span>
                                    </div>
                                    <div style={{marginBottom:16}}>
                                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:DIM,marginBottom:3}}><span>Created</span><span style={{color:'#fff'}}>{formatDate(ent.createdAt)}</span></div>
                                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:DIM,marginBottom:3}}><span>Updated</span><span style={{color:'#fff'}}>{formatDate(ent.lastUpdatedAt)}</span></div>
                                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:DIM,marginBottom:3}}><span>Sessions</span><span style={{color:'#fff'}}>{ent.sessionsCompleted}{ent.totalSessions ? ' of ' + ent.totalSessions : ''} completed</span></div>
                                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:DIM,marginBottom:3}}><span>Hands</span><span style={{color:'#fff'}}>{ent.totalHands}</span></div>
                                        {(ent.bb || ent.sb) && <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:DIM}}><span>Blinds</span><span style={{color:'#fff'}}>BB {ent.bb} · SB {ent.sb}</span></div>}
                                    </div>
                                    {scored.length > 0 && (
                                        <div style={{marginBottom:isCompleted&&ent.winner?12:0}}>
                                            <div style={{color:'rgba(255,255,255,0.45)',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
                                                {isCompleted ? 'Final Standings' : isTerminated ? 'Standings at Termination' : 'Current Standings'}
                                            </div>
                                            {scored.map(p => (
                                                <div key={p.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                                                    <span style={{color:'#fff',fontSize:14}}>{medalMap.get(p)} {p.name}</span>
                                                    <span style={{color:G,fontSize:13,fontWeight:700}}>{p.score>0?'+':''}{p.score.toLocaleString()} pts</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {isCompleted && ent.winner && (
                                        <div style={{marginTop:12,padding:'10px 14px',background:'rgba(240,192,64,0.1)',border:'1px solid rgba(240,192,64,0.25)',borderRadius:10,textAlign:'center'}}>
                                            <div style={{color:G,fontWeight:800,fontSize:15}}>🏆 {ent.winner}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                        {sbDetailTab === 'breakdown' && (() => {
                            const ent = sbDetailEntry;
                            const players = ent.gameState?.players || [];
                            const scores = ent.scores || {};
                            const sortedPls = players.slice().sort((a,b) => (scores[b.id]||0) - (scores[a.id]||0));
                            const sh = ent.sessionHistory || [];
                            const maxSn = sh.length ? Math.max(...sh.map(h => h.sn)) : 0;
                            const snCols = maxSn > 0 ? Array.from({length:maxSn},(_,i)=>i+1) : [];
                            if (snCols.length === 0) return <p style={{color:DIM,fontSize:13,margin:0}}>No completed sessions yet.</p>;
                            return (
                                <div style={{display:'flex',maxHeight:'60vh',overflowY:'auto'}}>
                                    <div style={{flexShrink:0,width:90}}>
                                        <div style={{height:24}}/>
                                        {sortedPls.map(p => (
                                            <div key={p.id} style={{height:34,display:'flex',alignItems:'center',fontSize:12,color:'#fff',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:4}}>{p.name}</div>
                                        ))}
                                    </div>
                                    <div style={{flex:1,overflowX:'auto'}}>
                                        <div style={{minWidth:snCols.length*44}}>
                                            <div style={{display:'flex',height:24,alignItems:'flex-end',paddingBottom:4,borderBottom:'1px solid rgba(255,255,255,0.12)',marginBottom:2}}>
                                                {snCols.map(sn => <div key={sn} style={{width:44,flexShrink:0,textAlign:'center',color:G,fontWeight:700,fontSize:11}}>S{sn}</div>)}
                                            </div>
                                            {sortedPls.map(p => (
                                                <div key={p.id} style={{display:'flex',alignItems:'center',height:34,borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                                    {snCols.map(colSn => {
                                                        const row = sh.find(h => h.sn === colSn);
                                                        const hasScore = row && row.scores[p.id] !== undefined;
                                                        const val = hasScore ? row.scores[p.id] : null;
                                                        return (
                                                            <div key={colSn} style={{width:44,flexShrink:0,textAlign:'center'}}>
                                                                {!hasScore ? <span style={{color:DIM,fontSize:12}}>—</span> : row.isTotal ? (
                                                                    <span><span style={{color:G,fontWeight:700,fontSize:12}}>{val}</span><span style={{color:DIM,fontSize:9,display:'block',lineHeight:1}}>total</span></span>
                                                                ) : <span style={{color:'#fff',fontSize:12,fontWeight:600}}>{val}</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                        {sbDetailTab === 'stats' && (
                            <ScoreboardStatsView
                                history={sbDetailEntry.history || []}
                                players={sbDetailEntry.gameState?.players || []}
                                scores={sbDetailEntry.scores || {}}
                            />
                        )}
                    </div>
                </div>
            )}
            {showAllTimeStats && (() => {
                const stats = computeAllTimeStats(sbEntries);
                const MEDALS = ['🥇','🥈','🥉'];
                return (
                    <div style={{position:'fixed',inset:0,zIndex:310,display:'flex',alignItems:'flex-end',justifyContent:'center'}}
                         onClick={()=>setShowAllTimeStats(false)}>
                        <div style={{width:'100%',maxWidth:480,background:'linear-gradient(160deg,#1a0f0a 0%,#0d0704 100%)',borderTopLeftRadius:20,borderTopRightRadius:20,border:'1px solid rgba(255,255,255,0.08)',maxHeight:'82vh',display:'flex',flexDirection:'column'}}
                             onClick={e=>e.stopPropagation()}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 18px',borderBottom:'1px solid rgba(255,255,255,0.08)',flexShrink:0}}>
                                <span style={{fontWeight:800,fontSize:16,color:'#fff'}}>📊 All-Time Stats</span>
                                <button onClick={()=>setShowAllTimeStats(false)} style={{background:'none',border:'none',color:DIM,fontSize:20,cursor:'pointer',padding:0}}>✕</button>
                            </div>
                            <div style={{padding:'8px 18px 4px',color:DIM,fontSize:12,flexShrink:0}}>
                                {stats.length} player{stats.length!==1?'s':''} · {sbEntries.length} game{sbEntries.length!==1?'s':''}
                            </div>
                            {stats.length === 0
                                ? <div style={{padding:30,textAlign:'center',color:DIM}}>No games yet.</div>
                                : <div style={{padding:'8px 18px 18px',overflowY:'auto',display:'flex',flexDirection:'column',gap:8}}>
                                    {stats.map((p, i) => {
                                        const key = p.displayName.toLowerCase();
                                        const expanded = expandedAtPlayers.has(key);
                                        const medal = (i < 3 && p.gamesWon > 0) ? MEDALS[i] + ' ' : '';
                                        return (
                                            <div key={key} onClick={()=>setExpandedAtPlayers(prev=>{const s=new Set(prev);s.has(key)?s.delete(key):s.add(key);return s;})}
                                                 style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,padding:'12px 14px',cursor:'pointer'}}>
                                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                                                    <span style={{fontWeight:700,fontSize:14,color:'#fff'}}>{medal}{p.displayName}</span>
                                                    <span style={{color:DIM,fontSize:11}}>{expanded?'▲':'▼'}</span>
                                                </div>
                                                <div style={{color:DIM,fontSize:12}}>
                                                    Games: <span style={{color:'#fff'}}>{p.gamesWon} won</span> / {p.gamesPlayed} played · <span style={{color:G}}>{p.winRate}% hand win rate</span>
                                                </div>
                                                {expanded && (
                                                    <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid rgba(255,255,255,0.07)',display:'flex',flexDirection:'column',gap:4}}>
                                                        <div style={{color:DIM,fontSize:12}}>Hands: <span style={{color:'#fff'}}>{p.handsWon} won</span> / {p.handsPlayed} played</div>
                                                        <div style={{color:DIM,fontSize:12}}>Biggest win: <span style={{color:'#4caf50'}}>+{p.biggestWin}</span> · Biggest loss: <span style={{color:'#ef5350'}}>-{p.biggestLoss}</span></div>
                                                        <div style={{color:DIM,fontSize:12}}>Fav hand: <span style={{color:'#fff'}}>{p.favHand}</span></div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            }
                        </div>
                    </div>
                );
            })()}
            {customTarget && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}>
                    <div style={{background:'#2a1a0e',border:'1px solid rgba(240,192,64,0.3)',borderRadius:12,padding:20,width:'min(340px,90vw)'}}>
                        <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:14}}>Custom Name</div>
                        <input
                            value={customName}
                            onChange={e => { setCustomName(e.target.value); setCustomError(''); }}
                            placeholder="3–9 characters"
                            maxLength={9}
                            autoFocus
                            style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:10}}
                        />
                        <label style={{display:'flex',alignItems:'center',gap:8,color:DIM,fontSize:13,marginBottom:14,cursor:'pointer'}}>
                            <input type="checkbox" checked={customSave} onChange={e => setCustomSave(e.target.checked)} style={{width:16,height:16,accentColor:'#f0c040'}} />
                            Save as preset
                        </label>
                        {customError && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:10}}>{customError}</div>}
                        <div style={{display:'flex',gap:10}}>
                            <Btn full bg="#555" onClick={() => setCustomTarget(null)}>Cancel</Btn>
                            <Btn full onClick={doCustomConfirm}>Confirm</Btn>
                        </div>
                    </div>
                </div>
            )}
            {showEditPresets && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}}>
                    <div style={{background:'#2a1a0e',border:'1px solid rgba(240,192,64,0.3)',borderRadius:12,padding:20,width:'min(340px,90vw)'}}>
                        <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:14}}>Edit Presets</div>
                        <select
                            value={editSelId}
                            onChange={e => { const id = e.target.value; setEditSelId(id); setEditName(presets.find(p => p.id === id)?.name || ''); setEditError(''); }}
                            style={{width:'100%',padding:'10px 12px',background:'#1a0f0a',border:'1px solid rgba(255,255,255,0.2)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',marginBottom:12}}
                        >
                            <option value="">— Select preset —</option>
                            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {editSelId && (
                            <>
                                <input
                                    value={editName}
                                    onChange={e => { setEditName(e.target.value); setEditError(''); }}
                                    placeholder="New name (3–9 chars)"
                                    maxLength={9}
                                    style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:10}}
                                />
                                {editError && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:10}}>{editError}</div>}
                                <div style={{marginBottom:8}}><Btn full onClick={doRenamePreset}>Confirm Rename</Btn></div>
                                <button
                                    onMouseDown={doDeletePreset}
                                    style={{width:'100%',padding:'10px',background:'rgba(239,83,80,0.15)',border:'1px solid rgba(239,83,80,0.4)',borderRadius:8,color:'#ef5350',fontSize:14,cursor:'pointer'}}
                                >🗑 Delete</button>
                            </>
                        )}
                        <button
                            onMouseDown={() => setShowEditPresets(false)}
                            style={{width:'100%',marginTop:12,padding:'10px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:DIM,fontSize:14,cursor:'pointer'}}
                        >Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
