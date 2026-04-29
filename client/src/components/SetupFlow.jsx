import React, { useState, useEffect } from 'react';
import socket from '../socket';
import { Btn, Card, Fld, G, SV, DIM, PLAYER_COLORS } from './UI';

export default function SetupFlow({ lobbyState, onLeave }) {
    const { setupPhase, players, hostId, equalStack, maxPlayers, settings } = lobbyState;
    const isHost = socket.id === hostId;

    // Configuring State (Host only)
    const [globalStack, setGlobalStack] = useState("1000");
    const [sbVal, setSbVal] = useState("5");
    const [bbVal, setBbVal] = useState("10");
    const [sessVal, setSessVal] = useState("3");
    const [indivStacks, setIndivStacks] = useState({});

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
        const myPlayer = players.find(p => p.id === socket.id);
        socket.emit("set_ready", !(myPlayer?.ready));
    };

    const doLock = () => {
        const nonHostPlayers = players.filter(p => !p.isHost);
        if (!nonHostPlayers.length || !nonHostPlayers.every(p => p.ready)) return;
        socket.emit("lock_room");
    };

    const doStartCountdown = () => {
        const sb=Number(sbVal), bb=Number(bbVal), sess=Number(sessVal);
        if(!sb||!bb||!sess||bb<=sb) return alert("BB > SB, sessions > 0");
        
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
            cfg: { sb, bb, sessions: sess },
            stacks
        });
    };

    if (setupPhase === 'waiting') {
        const myPlayer = players.find(p => p.id === socket.id);
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
                                        <span style={{color: p.id===socket.id ? G : "#fff", fontWeight:700}}>
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
                        <Fld lbl="Number of Sessions" val={sessVal} ch={e=>setSessVal(e.target.value)} type="number" mb={20}/>
                        
                        <Btn full onClick={doStartCountdown}>🏁 Start Game</Btn>
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