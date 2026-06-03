import React, { useState, useEffect } from 'react';
import socket from '../socket';
import { Btn, Card, Fld, G, SV, DIM, PLAYER_COLORS } from './UI';

export default function SetupFlow({ lobbyState, activeSeatId, onLeave }) {
    const { setupPhase, players, hostId, equalStack, maxPlayers, settings } = lobbyState;
    const activeId = activeSeatId || socket.id;
    const isHost = activeId === hostId;

    // Configuring State (Host only)
    const [globalStack, setGlobalStack] = useState("1000");
    const [sbVal, setSbVal] = useState("50");
    const [bbVal, setBbVal] = useState("100");
    const [sessVal, setSessVal] = useState("3");
    const [maxHandsVal, setMaxHandsVal] = useState("");
    const [indivStacks, setIndivStacks] = useState({});
    const [startFromCheck, setStartFromCheck] = useState(false);
    const [sfScreen, setSfScreen] = useState('config');
    const [sfSession, setSfSession] = useState('');
    const [sfMode, setSfMode] = useState(null);
    const [sfScores, setSfScores] = useState({});

    // Lock Players overwrite protection
    const [lockProtect, setLockProtect] = useState(null);
    const [lockPromoteName, setLockPromoteName] = useState('');
    const [lockPromoteError, setLockPromoteError] = useState('');

    // Countdown State
    const [timeLeft, setTimeLeft] = useState(5);


    useEffect(() => {
        if (setupPhase === 'countdown') {
            setTimeLeft(5);
            const int = setInterval(() => {
                setTimeLeft(t => Math.max(0, t - 1));
            }, 1000);
            return () => clearInterval(int);
        }
    }, [setupPhase]);

    const handleReady = () => {
        const myPlayer = players.find(p => p.id === activeId);
        socket.emit("set_ready", { playerId: activeId, ready: !(myPlayer?.ready) });
    };

    const doLock = () => {
        const nonHostPlayers = players.filter(p => !p.isHost);
        if (!nonHostPlayers.length || !nonHostPlayers.every(p => p.ready)) return;
        socket.emit('list_saves', (res) => {
            const autosave = res.saves?.find(s => s.saveId === 'autosave');
            const meaningful = !!autosave;
            if (!meaningful) { socket.emit('lock_room'); return; }
            if (!autosave.linkedSaveId) {
                setLockPromoteName('');
                setLockPromoteError('');
                setLockProtect({ type: 'unlinked', autosave });
            } else if (!autosave.synced) {
                setLockPromoteError('');
                setLockProtect({ type: 'linked_unsynced', autosave });
            } else {
                socket.emit('lock_room');
            }
        });
    };

    const doStartCountdown = () => {
        const sb=Number(sbVal), bb=Number(bbVal), sess=Number(sessVal);
        const mhps = maxHandsVal === "" ? null : parseInt(maxHandsVal, 10);
        if(!sb||!bb||!sess||bb<=sb) return alert("BB > SB, sessions > 0");
        if(maxHandsVal !== "" && (!(mhps > 0) || !Number.isInteger(mhps))) return alert("Max hands must be a positive integer, or leave blank for unlimited");
        if (startFromCheck) { setSfScreen('session_start'); return; }

        let stacks = {};
        if (equalStack) {
            const gs = Number(globalStack);
            if (!gs || gs <= 0) return alert("Enter valid global stack");
            players.forEach(p => stacks[p.id] = gs);
        } else {
            for (let p of players) {
                const s = Number(indivStacks[p.id]);
                if (!s || s <= 0) return alert(`Enter valid stack for ${p.name}`);
                stacks[p.id] = s;
            }
        }

        socket.emit("start_countdown", {
            cfg: { sb, bb, sessions: sess, maxHandsPerSession: mhps },
            stacks
        });
    };

    const doStartFromSession = () => {
        const sb=Number(sbVal), bb=Number(bbVal), sess=Number(sessVal);
        const mhps = maxHandsVal === "" ? null : parseInt(maxHandsVal, 10);
        const sfs = parseInt(sfSession, 10);
        if (!Number.isInteger(sfs) || sfs < 2 || sfs > sess - 1)
            return alert(`Session must be between 2 and ${sess - 1}`);
        if (!sfMode) return alert("Select a score entry mode");
        const scoreErrors = [];
        const builtScores = {};
        players.forEach(p => {
            const raw = (sfScores[p.id] || '').trim();
            if (sfMode === 'per_session') {
                const parts = raw.split(',').map(s => s.trim());
                if (parts.length !== sfs - 1) {
                    scoreErrors.push(`${p.name}: enter exactly ${sfs - 1} number${sfs - 1 === 1 ? '' : 's'}`);
                } else if (parts.some(s => !/^\d+$/.test(s))) {
                    scoreErrors.push(`${p.name}: all values must be whole numbers ≥ 0`);
                } else {
                    builtScores[p.id] = parts.map(Number);
                }
            } else {
                if (!/^\d+$/.test(raw)) {
                    scoreErrors.push(`${p.name}: must be a whole number ≥ 0`);
                } else {
                    builtScores[p.id] = Number(raw);
                }
            }
        });
        if (scoreErrors.length) return alert(scoreErrors.join('\n'));
        let stacks = {};
        if (equalStack) {
            const gs = Number(globalStack);
            if (!gs || gs <= 0) return alert("Enter valid global stack");
            players.forEach(p => stacks[p.id] = gs);
        } else {
            for (let p of players) {
                const s = Number(indivStacks[p.id]);
                if (!s || s <= 0) return alert(`Enter valid stack for ${p.name}`);
                stacks[p.id] = s;
            }
        }
        let presetScores;
        if (sfMode === 'per_session') {
            const sessionHistory = [];
            for (let i = 0; i < sfs - 1; i++) {
                const scores = {};
                players.forEach(p => { scores[p.id] = builtScores[p.id][i]; });
                sessionHistory.push({ sn: i + 1, scores });
            }
            presetScores = { mode: 'per_session', sessionHistory };
        } else {
            const totalScores = {};
            players.forEach(p => { totalScores[p.id] = builtScores[p.id]; });
            presetScores = { mode: 'total', totalScores };
        }
        socket.emit("start_countdown", {
            cfg: { sb, bb, sessions: sess, maxHandsPerSession: mhps },
            stacks,
            startFromSession: sfs,
            presetScores
        });
    };

    if (setupPhase === 'waiting') {
        const myPlayer = players.find(p => p.id === activeId);
        const iAmReady = myPlayer?.ready || false;
        const nonHostPlayers = players.filter(p => !p.isHost);
        const hasNonHostPlayers = nonHostPlayers.length > 0;
        const canProceed = hasNonHostPlayers && nonHostPlayers.every(p => p.ready);

        return (
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"80vh",padding:20}}>
                <div style={{maxWidth: 460, width: "100%"}}>
                    <Card>
                        <h2 style={{color:G, marginTop:0, textAlign:"center"}}>Waiting Room</h2>
                        <div style={{textAlign:"center", color:DIM, marginBottom: 20, fontSize: 13}}>
                            Waiting for players ({players.length}/{maxPlayers})
                        </div>

                        <div style={{display:"flex", flexDirection:"column", gap:10, marginBottom:20}}>
                            {players.map((p, i) => (
                                <div key={p.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.05)", padding:"10px 15px", borderRadius:10}}>
                                    <div style={{display:"flex", alignItems:"center", gap:10}}>
                                        <div style={{width:10, height:10, borderRadius:"50%", background:PLAYER_COLORS[i%PLAYER_COLORS.length]}}></div>
                                        <span style={{color: p.id===activeId ? G : (p.id===socket.id||p.id===socket.id+'_2') ? 'rgba(240,192,64,0.5)' : '#fff', fontWeight:700}}>
                                            {p.name} {p.isHost && <span style={{color:DIM, fontSize:11, marginLeft:4}}>(Host)</span>}
                                        </span>
                                    </div>
                                    <div>
                                        {p.ready ? <span style={{color:"#4caf50", fontWeight:800, fontSize:13}}>READY</span> : <span style={{color:DIM, fontSize:13}}>Waiting...</span>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {!isHost && (
                            <button
                                onClick={handleReady}
                                style={{
                                    width: "100%",
                                    padding: "16px 0",
                                    fontSize: 17,
                                    fontWeight: 900,
                                    letterSpacing: 1,
                                    textTransform: "uppercase",
                                    border: "none",
                                    borderRadius: 12,
                                    cursor: "pointer",
                                    marginBottom: 10,
                                    background: iAmReady
                                        ? "linear-gradient(180deg, #17864f 0%, #0f5c36 100%)"
                                        : "linear-gradient(180deg, #1fa463 0%, #157a47 100%)",
                                    color: "#fff",
                                    boxShadow: iAmReady
                                        ? "0 2px 8px rgba(31,164,99,0.3)"
                                        : "0 4px 18px rgba(31,164,99,0.55)",
                                    transition: "all 0.2s ease",
                                }}
                                onMouseEnter={e => { if (!iAmReady) e.currentTarget.style.boxShadow = "0 6px 24px rgba(31,164,99,0.75)"; }}
                                onMouseLeave={e => { e.currentTarget.style.boxShadow = iAmReady ? "0 2px 8px rgba(31,164,99,0.3)" : "0 4px 18px rgba(31,164,99,0.55)"; }}
                            >
                                {iAmReady ? "✓ READY" : "I AM READY"}
                            </button>
                        )}

                        {isHost && (
                            <>
                                <Btn full bg={canProceed ? "#1976d2" : "#333"} dis={!canProceed} onClick={doLock}>Lock Players & Proceed</Btn>
                                {!canProceed && <div style={{textAlign:'center', color:DIM, fontSize:12, marginTop:6}}>
                                    {!hasNonHostPlayers ? "Waiting for at least one other player" : "Waiting for all players to be ready"}
                                </div>}
                            </>
                        )}

                    </Card>
                </div>
            {lockProtect && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.80)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
                    <div style={{background:'#1a0f0a',borderRadius:16,padding:24,width:'100%',maxWidth:420}}>
                        {lockProtect.type === 'unlinked' ? (<>
                            <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:12}}>Autosave has unsaved progress</div>
                            <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:16,lineHeight:1.5}}>
                                Starting a new game will overwrite the current autosave (Session {lockProtect.autosave.sessionNumber} · Hand #{lockProtect.autosave.handNumber}). Promote it to a named save first?
                            </div>
                            <input value={lockPromoteName} onChange={e=>{setLockPromoteName(e.target.value);setLockPromoteError('');}}
                                placeholder="Save name"
                                style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.07)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box',outline:'none',marginBottom:8}}
                            />
                            {lockPromoteError && <div style={{color:'#ff6b6b',fontSize:12,marginBottom:8}}>{lockPromoteError}</div>}
                            <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:4}}>
                                <Btn full bg="#2e7d32" onClick={()=>{
                                    const n = lockPromoteName.trim();
                                    if (!n) return setLockPromoteError('Please enter a name');
                                    socket.emit('promote_autosave', { name: n }, (res) => {
                                        if (res.success) { setLockProtect(null); socket.emit('lock_room'); }
                                        else {
                                            const msg = res.message?.startsWith('DUPLICATE_NAME:')
                                                ? `A save named '${n}' already exists. Choose a different name.`
                                                : (res.message || 'Promote failed');
                                            setLockPromoteError(msg);
                                        }
                                    });
                                }}>💾 Promote and continue</Btn>
                                <Btn full bg="rgba(255,255,255,0.09)" onClick={()=>{setLockProtect(null);socket.emit('lock_room');}}>Discard and continue</Btn>
                                <Btn full bg="rgba(255,255,255,0.05)" onClick={()=>setLockProtect(null)}>Cancel</Btn>
                            </div>
                        </>) : (<>
                            <div style={{color:G,fontWeight:700,fontSize:16,marginBottom:12}}>Autosave is ahead of linked save</div>
                            <div style={{color:'rgba(255,255,255,0.7)',fontSize:13,marginBottom:20,lineHeight:1.5}}>
                                Autosave (Session {lockProtect.autosave.sessionNumber} · Hand #{lockProtect.autosave.handNumber}) is ahead of <strong style={{color:'#fff'}}>{lockProtect.autosave.linkedName || 'linked save'}</strong>. Sync before starting a new game?
                            </div>
                            <div style={{display:'flex',flexDirection:'column',gap:10}}>
                                <Btn full bg="#2e7d32" onClick={()=>{
                                    socket.emit('sync_autosave_with_linked', (res) => {
                                        if (res.success) { setLockProtect(null); socket.emit('lock_room'); }
                                        else setLockPromoteError(res.message || 'Sync failed');
                                    });
                                }}>🔗 Sync and continue</Btn>
                                <Btn full bg="rgba(255,255,255,0.09)" onClick={()=>{setLockProtect(null);socket.emit('lock_room');}}>Discard and continue</Btn>
                                <Btn full bg="rgba(255,255,255,0.05)" onClick={()=>setLockProtect(null)}>Cancel</Btn>
                            </div>
                        </>)}
                    </div>
                </div>
            )}
            </div>
        );
    }

    if (setupPhase === 'configuring') {
        if (!isHost) {
            return (
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"80vh",padding:20, textAlign:"center"}}>
                    <div>
                        <div style={{fontSize:40, animation:"spin 2s linear infinite", marginBottom:20}}>⚙️</div>
                        <h2 style={{color:G}}>Host is setting up the game...</h2>
                        <p style={{color:DIM}}>Waiting for final configuration</p>
                    </div>
                </div>
            );
        }

        if (sfScreen === 'session_start') {
            const sess = Number(sessVal);
            const sfs = parseInt(sfSession, 10);
            const validSfs = Number.isInteger(sfs) && sfs >= 2 && sfs <= sess - 1;
            return (
                <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"80vh",padding:20}}>
                    <div style={{maxWidth:460,width:"100%"}}>
                        <Card>
                            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                                <button onClick={()=>{setSfScreen('config');setSfSession('');setSfMode(null);setSfScores({});}} style={{background:"none",border:"none",color:G,fontSize:20,cursor:"pointer",padding:"0 4px",lineHeight:1}}>←</button>
                                <h2 style={{color:G,margin:0,fontSize:18}}>Start from Session</h2>
                            </div>
                            <Fld lbl="Which session to start from?" val={sfSession} ch={e=>{setSfSession(e.target.value);setSfScores({});setSfMode(null);}} type="number" ph={`2 – ${sess - 1}`} mb={20}/>
                            {validSfs && (
                                <>
                                    <div style={{color:DIM,fontSize:13,marginBottom:10}}>How do you want to enter past scores?</div>
                                    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
                                        {[['per_session','Enter points of each session'],['total','Enter total points of all sessions']].map(([val,lbl])=>(
                                            <label key={val} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:sfMode===val?"rgba(240,192,64,0.10)":"rgba(255,255,255,0.05)",padding:"10px 14px",borderRadius:10,border:`1px solid ${sfMode===val?"rgba(240,192,64,0.4)":"rgba(255,255,255,0.10)"}`}}>
                                                <input type="radio" name="sfMode" value={val} checked={sfMode===val} onChange={()=>{setSfMode(val);setSfScores({});}} style={{accentColor:G}}/>
                                                <span style={{color:"#fff",fontSize:14}}>{lbl}</span>
                                            </label>
                                        ))}
                                    </div>
                                </>
                            )}
                            {validSfs && sfMode && (
                                <>
                                    <div style={{color:DIM,fontSize:13,marginBottom:10}}>
                                        {sfMode==='per_session' ? `Enter ${sfs-1} comma-separated score${sfs-1===1?'':'s'} per player (sessions 1–${sfs-1})` : "Enter each player's total score across all skipped sessions"}
                                    </div>
                                    <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
                                        {players.map(p=>(
                                            <div key={p.id} style={{display:"flex",alignItems:"center",gap:10}}>
                                                <div style={{width:100,color:"#fff",fontSize:14,flexShrink:0}}>{p.name}</div>
                                                <div style={{flex:1}}>
                                                    <Fld val={sfScores[p.id]||""} ch={e=>setSfScores(prev=>({...prev,[p.id]:e.target.value}))} ph={sfMode==='per_session'?`e.g. ${Array.from({length:sfs-1},(_,i)=>i+1).join(', ')}`:"0"} mb={0}/>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <Btn full onClick={doStartFromSession}>🏁 Start Game</Btn>
                                </>
                            )}
                        </Card>
                    </div>
                </div>
            );
        }

        return (
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"80vh",padding:20}}>
                <div style={{maxWidth: 460, width: "100%"}}>
                    <Card>
                        <h2 style={{color:G, marginTop:0, textAlign:"center"}}>Final Settings</h2>

                        {equalStack ? (
                            <Fld lbl="Universal Starting Stack" val={globalStack} ch={e=>setGlobalStack(e.target.value)} type="number" mb={20}/>
                        ) : (
                            <div style={{marginBottom: 20}}>
                                <div style={{color:DIM, fontSize:13, marginBottom:10}}>Assign Stacks</div>
                                {players.map(p => (
                                    <div key={p.id} style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
                                        <div style={{width: 100, color:"#fff", fontSize: 14}}>{p.name}</div>
                                        <div style={{flex:1}}><Fld val={indivStacks[p.id]||""} ch={e=>setIndivStacks({...indivStacks, [p.id]: e.target.value})} type="number" ph="Stack" mb={0}/></div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <Fld lbl="Small Blind" val={sbVal} ch={e=>{setSbVal(e.target.value);setBbVal(String(Number(e.target.value)*2));}} type="number"/>
                        <Fld lbl="Big Blind" val={bbVal} ch={e=>setBbVal(e.target.value)} type="number"/>
                        <Fld lbl="Number of Sessions" val={sessVal} ch={e=>setSessVal(e.target.value)} type="number"/>
                        <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 16px"}}>
                            <input type="checkbox" id="sfCheck" checked={startFromCheck} onChange={e=>setStartFromCheck(e.target.checked)} style={{width:16,height:16,accentColor:G,cursor:"pointer"}}/>
                            <label htmlFor="sfCheck" style={{color:"#fff",fontSize:14,cursor:"pointer"}}>Start from a session</label>
                        </div>
                        <Fld lbl="Max Hands per Session" val={maxHandsVal} ch={e=>setMaxHandsVal(e.target.value)} type="number" ph="∞ (unlimited)" mb={20}/>

                        <Btn full onClick={doStartCountdown}>{startFromCheck ? '▶ Configure Sessions →' : '🏁 Start Game'}</Btn>
                    </Card>
                </div>
            </div>
        );
    }

    if (setupPhase === 'countdown') {
        return (
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"80vh",padding:20, textAlign:"center"}}>
                <div style={{maxWidth: 460, width: "100%"}}>
                    <Card sx={{padding: 40}}>
                        <h2 style={{color:"#fff", margin: "0 0 20px", fontSize: 24}}>Game Starts In</h2>
                        <div style={{fontSize: 80, fontWeight: 900, color: G, marginBottom: 30, textShadow: "0 0 20px rgba(240,192,64,0.5)"}}>
                            {timeLeft}
                        </div>
                        <div style={{background: "rgba(0,0,0,0.4)", padding: 15, borderRadius: 12}}>
                            <div style={{color: DIM, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5}}>Settings</div>
                            <div style={{color: "#fff", fontSize: 16, fontWeight: 700}}>Blinds: {settings.cfg.sb} / {settings.cfg.bb}</div>
                            <div style={{color: "#fff", fontSize: 16, fontWeight: 700}}>Sessions: {settings.cfg.sessions}</div>
                            {settings.cfg.maxHandsPerSession && <div style={{color: "#fff", fontSize: 16, fontWeight: 700}}>Max Hands/Session: {settings.cfg.maxHandsPerSession}</div>}
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    if (setupPhase === 'loaded_waiting') {
        const expectedNames = lobbyState.expectedNames || [];
        const joinedNames = players.map(p => p.name.toLowerCase());
        const allJoined = expectedNames.length === players.length;

        return (
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"80vh",padding:20}}>
                <div style={{maxWidth: 460, width: "100%"}}>
                    <Card>
                        <h2 style={{color:G, marginTop:0, textAlign:"center"}}>🔄 Loaded Game</h2>
                        <div style={{textAlign:"center", color:DIM, marginBottom: 20, fontSize: 13}}>
                            Waiting for original players to rejoin ({players.length}/{expectedNames.length})
                        </div>

                        <div style={{display:"flex", flexDirection:"column", gap:8, marginBottom:20}}>
                            {expectedNames.map((name, i) => {
                                const joined = joinedNames.includes(name.toLowerCase());
                                return (
                                    <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center", background: joined ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.05)", padding:"10px 15px", borderRadius:10, border: joined ? "1px solid rgba(76,175,80,0.3)" : "1px solid transparent"}}>
                                        <div style={{display:"flex", alignItems:"center", gap:10}}>
                                            <div style={{width:10, height:10, borderRadius:"50%", background: joined ? "#4caf50" : "rgba(255,255,255,0.2)"}}></div>
                                            <span style={{color: joined ? "#fff" : DIM, fontWeight:700}}>{name}</span>
                                        </div>
                                        <span style={{fontSize:13, fontWeight:800, color: joined ? "#4caf50" : DIM}}>
                                            {joined ? "✓ JOINED" : "WAITING..."}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {isHost && (
                            <Btn full bg={allJoined ? "#1a7a40" : "#333"} dis={!allJoined} onClick={() => {
                                socket.emit('resume_loaded_game', (res) => {
                                    if (!res.success) alert(res.message);
                                });
                            }}>
                                {allJoined ? "▶ Resume Game" : `Waiting for ${expectedNames.length - players.length} more player(s)`}
                            </Btn>
                        )}

                        {!isHost && (
                            <div style={{textAlign:"center", padding:"15px 0", color:DIM, fontSize:14}}>
                                <div style={{fontSize:20,marginBottom:6}}>⏳</div>
                                Waiting for host to resume the game...
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        );
    }

    return null;
}