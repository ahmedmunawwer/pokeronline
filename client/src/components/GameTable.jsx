import React, { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';
import PhaseModal from './PhaseModal';
import { Btn, Card, Ov, DB, HoleCard, CommCard, getCommunityCards, CDlg, SSDlg, HRDlg, StatsMod, ChipStackSVG, PLAYER_COLORS, G, SV, BR, DIM, MED, PL, RVLI, HandRankModal, buildPots, PotDetailModal, HandHistoryModal } from './UI';

// Equal-angular ellipse spacing — local player always at bottom (90°), others arc clockwise.
function getSeatPositions(n) {
    if (n <= 1) return [{ left: 50, top: 92 }];
    const cx = 50, cy = 50, rx = 40, ry = 42;
    const step = 360 / n;
    return Array.from({ length: n }, (_, j) => {
        const th = (90 + j * step) * Math.PI / 180;
        return {
            left: Math.round((cx + rx * Math.cos(th)) * 10) / 10,
            top:  Math.round((cy + ry * Math.sin(th)) * 10) / 10,
        };
    });
}

const DIM_STRONG = "rgba(255,255,255,0.65)";

const TONE_STYLES = {
    allin:   { bg: 'linear-gradient(180deg, rgba(88,20,156,0.95) 0%, rgba(58,10,118,0.95) 100%)',    border: 'rgba(160,80,255,0.70)',  glow: '0 0 28px rgba(140,60,240,0.55), inset 0 0 0 1px rgba(180,100,255,0.25)', accent: '#b06aff', label: 'All In'   },
    reraise: { bg: 'linear-gradient(180deg, rgba(200,55,0,0.95) 0%, rgba(155,30,0,0.95) 100%)',      border: 'rgba(255,90,30,0.75)',   glow: '0 0 26px rgba(255,90,30,0.45), inset 0 0 0 1px rgba(255,130,60,0.25)', accent: '#ff5722', label: 'Re-raise'  },
    raise:   { bg: 'linear-gradient(180deg, rgba(180,85,0,0.95) 0%, rgba(140,55,0,0.95) 100%)',      border: 'rgba(255,140,0,0.65)',   glow: '0 0 24px rgba(255,140,0,0.40), inset 0 0 0 1px rgba(255,170,60,0.25)', accent: '#ff8c00', label: 'Raise'     },
    bet:     { bg: 'linear-gradient(180deg, rgba(140,80,0,0.92) 0%, rgba(100,56,0,0.92) 100%)',      border: 'rgba(255,180,0,0.55)',   glow: '0 0 14px rgba(255,180,0,0.28)',                                         accent: '#ffb300', label: 'Bet'       },
    call:    { bg: 'linear-gradient(180deg, rgba(20,40,68,0.92) 0%, rgba(14,28,48,0.92) 100%)',      border: 'rgba(100,160,230,0.45)', glow: '0 4px 12px rgba(0,0,0,0.45)',                                            accent: '#7ec0ff', label: 'Call'      },
    check:   { bg: 'linear-gradient(180deg, rgba(20,60,28,0.92) 0%, rgba(12,42,18,0.92) 100%)',      border: 'rgba(80,200,110,0.35)',  glow: '0 0 14px rgba(80,200,110,0.20)',                                         accent: '#5ecb7a', label: 'Check'     },
    fold:    { bg: 'linear-gradient(180deg, rgba(96,28,28,0.92) 0%, rgba(64,16,16,0.92) 100%)',      border: 'rgba(220,90,90,0.55)',   glow: '0 0 14px rgba(220,90,90,0.30)',                                          accent: '#ff8d8d', label: 'Fold'      },
    deal:    { bg: 'linear-gradient(180deg, rgba(24,40,30,0.92) 0%, rgba(14,28,20,0.92) 100%)',      border: 'rgba(120,180,140,0.32)', glow: '0 4px 12px rgba(0,0,0,0.45)',                                            accent: '#9bd2a0', label: 'Deal'      },
    idle:    { bg: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)', border: 'rgba(255,255,255,0.10)', glow: '0 4px 12px rgba(0,0,0,0.45)',                                          accent: DIM_STRONG, label: 'Idle'    },
};

export default function GameTable({ gameState, emitAction, socket, myId, isHost, onLeave, appPlayerName, appRoomCode }) {
    const { phase, players, cfg, pot, cp, dealer, queue, hc, ai, rBets, curBet, lr, lfb, scores, history, undoStack, pi, wi, hn, sn, ba, cpd: backendCpd, log, confirmations, potAward, restartApprovals, restartHostConfirming, restartCountdown, lastLeaver } = gameState;

    const [rm, setRm] = useState(false);
    const [ra, setRa] = useState("");
    const [mc, setMc] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [showSt, setShowSt] = useState(false);
    const [cdlg, setCdlg] = useState(null);
    const [hrd, setHrd] = useState(null);
    const [sseld, setSseld] = useState(null);
    const [ssel, setSsel] = useState([]);
    const [goView, setGoView] = useState("main");
    const [showUndoDlg, setShowUndoDlg] = useState(false);
    const [showHandRank, setShowHandRank] = useState(false);
    const [showHandHistory, setShowHandHistory] = useState(false);
    const [showCumulative, setShowCumulative] = useState(false);
    const [confirmingAllIn, setConfirmingAllIn] = useState(false);
    const [showPotModal, setShowPotModal] = useState(false);

    useEffect(() => { setShowCumulative(false); }, [sn]);
    useEffect(() => { setConfirmingAllIn(false); }, [rm]);
    useEffect(() => { if (potAward) setShowPotModal(false); }, [potAward]);

    const n = players ? players.length : 0;
    const actI = queue ? queue[0] : null;
    const isBet = phase==="preflop"||phase==="flop"||phase==="turn"||phase==="river";
    const actP = isBet && actI !== undefined && actI !== null ? players[actI] : null;
    const toCall = isBet && actP ? curBet - (rBets[actI]||0) : 0;
    const sbI = (dealer+1)%n;
    const bbI = (dealer+2)%n;
    const rvli = RVLI[phase];
    const cpd = backendCpd || (phase==="showdown" && cp ? cp[pi] : null);
    const isMyTurn = isBet && actP && actP.id === myId;
    const isDealer = players && players[dealer] && players[dealer].id === myId;
    const confirmed = confirmations || [];
    const myConfirmed = confirmed.includes(myId);
    const activeWithChips = isBet ? players.filter(p => !p.folded && p.stack > 0).length : 0;
    const canRaiseBtn = isBet && !(curBet > lfb && (rBets[actI]||0) >= lfb) && activeWithChips > 1;

    const effectivePots = (cp && cp.length > 0)
        ? cp
        : (ai && ai.length > 0 ? buildPots(players, hc, ai) : []);
    const hasMultiplePots = effectivePots.length > 1;
    const totalPot = hasMultiplePots
        ? effectivePots.reduce((s, p) => s + p.amount, 0)
        : pot;

    // Handlers
    const proceedReveal = () => emitAction('reveal');
    const doFold = () => emitAction('fold');
    const doCheck = () => emitAction('check');
    const doCall = () => emitAction('call');
    const doRaise = () => { emitAction('raise', ra); setRm(false); setRa(""); setMc(false); };
    const doAllIn = () => emitAction('allin');

    const doConfirm = (d) => {
        setCdlg(null);
        if(d.type==="winner") { setHrd({wi:d.id, name:d.name, amt:d.amt, label:d.label, tier:0}); }
        else if(d.type==="split") { emitAction('split_win', null, { elig: d.eligible, amount: d.amt }); }
    };
    const finalWin = (w, hr) => { emitAction('award_win', null, {wid: w, hr}); };
    const nextSession = () => emitAction('next_session');

    const handleUndo = () => emitAction('undo');

    const gameOver = (phase === "end" || phase === "session_end") && sn >= cfg.sessions;
    const sei = phase === "session_end" ? gameState.sei : null;

    // ── Full-page terminal: all sessions complete ──────────────────────────────
    if(gameOver){
        const gs=players.slice().sort((a,b)=>(scores[b.id]||0)-(scores[a.id]||0)),li=gs.length-1;
        const totalActiveY = players.filter(p=>!p.inactive).length;
        const approvalList = restartApprovals || [];
        const approvalX = approvalList.length;
        const myApproval = approvalList.includes(myId);

        if (restartCountdown !== null && restartCountdown !== undefined) {
            return (
                <div style={{minHeight:'100vh',background:'radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <div style={{textAlign:'center'}}>
                        <div style={{fontSize:80,fontWeight:900,color:G,lineHeight:1}}>{restartCountdown}</div>
                        <div style={{color:'#fff',fontSize:18,marginTop:12}}>Restarting...</div>
                    </div>
                </div>
            );
        }

        if (lastLeaver && lastLeaver.atGameOver) {
            return (
                <div style={{minHeight:'100vh',background:'radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
                    <div style={{maxWidth:360,width:'100%',textAlign:'center'}}>
                        <div style={{fontSize:44,marginBottom:12}}>👋</div>
                        <p style={{color:'#fff',fontSize:18,fontWeight:800,margin:'0 0 8px'}}>{lastLeaver.name} left</p>
                        <p style={{color:DIM,fontSize:13,margin:'0 0 24px'}}>The game can no longer continue.</p>
                        <Btn full bg="#8b1a1a" onClick={()=>{socket.emit('leave_room');if(onLeave)onLeave();}}>Return to Home</Btn>
                    </div>
                </div>
            );
        }

        if(goView==="scores")return(<div style={{padding:20}}><div style={{maxWidth:460,margin:"0 auto"}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 0 10px"}}><button onClick={()=>setGoView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button><h2 style={{color:G,margin:0}}>Final Scoreboard</h2></div><Card>{gs.map((p,i)=>{const clr=i===0?G:i===1?SV:i===2?BR:i===li?"#ff3333":"#fff";return(<div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 4px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span style={{color:clr,fontWeight:i===0?800:400}}>{i===0?"👑 ":""}{MED[i]} {p.name}</span><span style={{color:clr,fontWeight:700}}>{scores[p.id]||0} pts</span></div>);})}</Card>{showStats&&<StatsMod hist={history} pls={players} scores={scores} onClose={()=>setShowStats(false)}/>}</div></div>);

        const hostConfirmOverlay = restartHostConfirming && (
            <Ov><DB>
                <div style={{textAlign:'center'}}>
                    <div style={{fontSize:36,marginBottom:10}}>🚀</div>
                    <p style={{color:G,fontWeight:800,fontSize:17,margin:'0 0 8px'}}>All {totalActiveY} players ready!</p>
                    <p style={{color:DIM,fontSize:13,margin:'0 0 20px'}}>Start a new game with the same settings?</p>
                    {isHost ? (
                        <div style={{display:'flex',gap:10}}>
                            <Btn full bg="#b8880e" onClick={()=>socket.emit('restart_confirm')}>Restart</Btn>
                            <Btn full bg="#8b1a1a" onClick={()=>{socket.emit('restart_leave');if(onLeave)onLeave();}}>Leave</Btn>
                        </div>
                    ) : (
                        <>
                            <p style={{color:DIM,fontSize:13,marginBottom:16}}>Waiting for host to confirm...</p>
                            <Btn full bg="#8b1a1a" onClick={()=>{socket.emit('restart_leave');if(onLeave)onLeave();}}>Leave</Btn>
                        </>
                    )}
                </div>
            </DB></Ov>
        );

        return(<div style={{padding:20}}>
          <style>{`.drip{color:#ff2222;animation:dr 2s infinite;font-weight:800}@keyframes dr{0%,100%{text-shadow:0 0 0 #f00}50%{text-shadow:0 3px 10px #f00,0 8px 5px #800}}`}</style>
          {hostConfirmOverlay}
          <div style={{maxWidth:460,margin:"0 auto"}}>
            <div style={{textAlign:"center",padding:"16px 0 10px"}}><div style={{fontSize:44}}>🏁</div><h1 style={{color:G,fontSize:24,margin:"5px 0 2px"}}>GAME OVER</h1><p style={{color:DIM,fontSize:13}}>All {cfg.sessions} sessions complete!</p></div>
            <Card>{gs.map((p,i)=>{const isW=i===0,isL=i===li,clr=isW?G:i===1?SV:i===2?BR:isL?"#ff3333":"#fff";return(<div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 6px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span style={{color:clr,fontWeight:isW?800:400,fontSize:isW?17:14}}>{isW?"👑 ":""}{isL?<span className="drip">{p.name} ☠️</span>:<span>{MED[i]} {p.name}</span>}</span><span style={{color:clr,fontWeight:700}}>{scores[p.id]||0} pts</span></div>);})}</Card>
            <div style={{display:'flex',gap:10,marginBottom:8}}>
                <Btn full bg={myApproval?'#1a7a40':'#b8880e'} onClick={()=>socket.emit('restart_toggle')}>
                    {myApproval?'✓ Approved':'Restart'} [{approvalX}/{totalActiveY}]
                </Btn>
                <Btn full bg="#8b1a1a" onClick={()=>{socket.emit('restart_leave');if(onLeave)onLeave();}}>Leave</Btn>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <Btn full bg="#333" onClick={()=>setGoView("scores")}>📋 Scoreboard</Btn>
              <Btn full bg="#333" onClick={()=>setShowStats(true)}>📊 Statistics</Btn>
            </div>
            {showStats&&<StatsMod hist={history} pls={players} scores={scores} onClose={()=>setShowStats(false)}/>}
          </div>
        </div>);
    }

    // ── Perspective seating ────────────────────────────────────────────────────
    const myIdx = players ? players.findIndex(p => p.id === myId) : -1;
    const myLocalIdx = myIdx === -1 ? 0 : myIdx;
    const seatPositions = getSeatPositions(n);
    const sortedSt = players.slice().sort((a,b) => b.stack - a.stack);

    const pg = { minHeight:"100vh", background:"radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)", color:"#fff", padding:"6px 14px 14px", fontFamily:"'Segoe UI',sans-serif", boxSizing:"border-box" };

    return (
        <div style={pg}>
            <div className="gt-shell">

                {/* ── Modals and overlays (unchanged) ─────────────────────── */}
                {showStats && <StatsMod hist={history} pls={players} scores={scores} onClose={()=>setShowStats(false)}/>}
                {showHandRank && <HandRankModal onClose={()=>setShowHandRank(false)}/>}
                {showHandHistory && <HandHistoryModal history={history} currentSn={sn} onClose={()=>setShowHandHistory(false)}/>}
                {showPotModal && hasMultiplePots && <PotDetailModal pots={effectivePots} players={players} onClose={()=>setShowPotModal(false)}/>}
                {cdlg && <CDlg d={cdlg} onClose={()=>setCdlg(null)} onConfirm={doConfirm}/>}
                {hrd && <HRDlg d={hrd} onSelect={hr=>{const w=hrd.wi;setHrd(null);finalWin(w,hr);}} setTier={t=>setHrd({...hrd,tier:t})} onSkip={()=>{const w=hrd.wi;setHrd(null);finalWin(w,null);}}/>}
                {sseld && <SSDlg d={sseld} sel={ssel} setSel={setSsel} onClose={()=>{setSseld(null);setSsel([]);}} onSplit={(e,a,l)=>{const names=e.map(x=>x.name).join(" & ");setSseld(null);setSsel([]);setCdlg({type:"split",eligible:e,amt:a,label:l,names});}}/>}

                {showUndoDlg && <ConfirmDialog title="Undo last action?" body="This will roll back the most recent move. All players will see the change." confirmLabel="Yes, undo" confirmBg="#b8680e" onConfirm={()=>{ setShowUndoDlg(false); handleUndo(); }} onCancel={()=>setShowUndoDlg(false)} />}

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="gt-header" style={{
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    marginBottom:10, padding:'8px 12px',
                    background:'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                    border:'1px solid rgba(255,255,255,0.06)',
                    borderRadius:14,
                    backdropFilter:'blur(8px)',
                    gap:12
                }}>
                    {/* landscape-only: identity row — hidden in portrait/desktop via CSS */}
                    <div className="gt-app-info">
                        {appPlayerName && <span className="gt-app-info__name">{appPlayerName}</span>}
                        {appPlayerName && appRoomCode && <span className="gt-app-info__sep">·</span>}
                        {appRoomCode && <span className="gt-app-info__room">{appRoomCode}</span>}
                    </div>
                    <div style={{display:'flex', alignItems:'baseline', gap:10, flex:1, minWidth:0, overflow:'hidden', whiteSpace:'nowrap'}}>
                        <div style={{fontSize:16, fontWeight:900, color:G, letterSpacing:1.2, flexShrink:0}}>
                            {PL[phase]||phase}
                        </div>
                        <div style={{fontSize:10, color:DIM_STRONG, letterSpacing:1.2, fontWeight:700, textTransform:'uppercase', overflow:'hidden', textOverflow:'ellipsis'}}>
                            <span>Session {sn}/{cfg.sessions}</span>
                            <span style={{color:DIM, margin:'0 6px'}}>·</span>
                            <span>Hand #{hn}</span>
                            <span style={{color:DIM, margin:'0 6px'}}>·</span>
                            <span style={{color:DIM_STRONG, fontWeight:600}}>Blinds {cfg.sb}/{cfg.bb}</span>
                        </div>
                    </div>
                    <div style={{display:'flex', gap:6, alignItems:'center', flexShrink:0}}>
                        {isHost && <button onClick={()=>setShowUndoDlg(true)} style={{background:'rgba(255,255,255,0.10)',border:'1px solid rgba(255,255,255,0.30)',borderRadius:'50%',width:30,height:30,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>↩️</button>}
                        {isHost && <button onClick={()=>socket.emit('save_game',(res)=>{if(res.success)alert('Game saved! ID: '+res.saveId);else alert('Save failed: '+res.message);})} style={{background:'rgba(100,180,100,0.14)',border:'1px solid rgba(100,180,100,0.36)',borderRadius:'50%',width:30,height:30,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>💾</button>}
                        <button onClick={()=>setShowHandRank(true)} style={{background:'rgba(240,192,64,0.12)',border:'1px solid rgba(240,192,64,0.32)',borderRadius:'50%',width:30,height:30,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>🃏</button>
                        <button onClick={()=>setShowHandHistory(true)} style={{background:'rgba(240,192,64,0.20)',border:'1px solid rgba(240,192,64,0.45)',borderRadius:'50%',width:30,height:30,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>📈</button>
                        <button onClick={()=>setShowStats(true)} style={{background:'rgba(240,192,64,0.20)',border:'1px solid rgba(240,192,64,0.45)',borderRadius:'50%',width:30,height:30,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>📊</button>
                    </div>
                </div>

                {/* ── Main: felt table ────────────────────────────────────── */}
                <div className="gt-main">
                    <div className="poker-table-bg" style={{position:'relative', isolation:'isolate'}}>

                        {/* Center: pot pill + community cards */}
                        <div style={{position:'relative', zIndex:25, display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
                            {/* Pot pill */}
                            <div
                                onClick={() => hasMultiplePots && setShowPotModal(true)}
                                style={{
                                    display:'flex', flexDirection:'column', alignItems:'center',
                                    background:'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%)',
                                    border:`1px solid rgba(240,192,64,${hasMultiplePots ? 0.75 : 0.45})`,
                                    borderRadius:999,
                                    padding:'4px 14px',
                                    boxShadow:'0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                                    minWidth:110,
                                    cursor: hasMultiplePots ? 'pointer' : 'default',
                                }}
                            >
                                <div style={{display:'flex', alignItems:'center', gap:4, fontSize:9, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:1.5, fontWeight:800}}>
                                    {hasMultiplePots ? 'POTS' : 'MAIN POT'}
                                    {hasMultiplePots && <span style={{fontSize:10, opacity:0.6}}>ⓘ</span>}
                                </div>
                                <div style={{fontSize:18, fontWeight:900, color:G, lineHeight:1.1, textShadow:'0 0 12px rgba(240,192,64,0.4)'}}>{totalPot}</div>
                            </div>

                            {/* Community cards — single row with ghost placeholders */}
                            {(()=>{
                                const cards = getCommunityCards(phase);
                                return (
                                    <div style={{display:'flex', gap:6, justifyContent:'center', alignItems:'center'}}>
                                        {cards.map((card, i) => (
                                            <CommCard key={i} up={card.up} rank={card.rank} suit={card.suit} red={card.red} />
                                        ))}
                                        {cards.length < 5 && Array.from({length: 5 - cards.length}).map((_, i) => (
                                            <div key={`ghost-${i}`} style={{
                                                width:30, height:42, borderRadius:4,
                                                border:'1px dashed rgba(255,255,255,0.10)',
                                                background:'rgba(0,0,0,0.18)'
                                            }} />
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Players — perspective seating */}
                        {players.map((_, j) => {
                            const i = (myLocalIdx + j) % n;
                            const p = players[i];
                            const pos = seatPositions[j] || { left:50, top:50 };
                            const isAct = i === actI && isBet;
                            const hasActed = isBet && !queue.includes(i);
                            const isLocal = p.id === myId;

                            const betAmt = rBets[i] || 0;
                            const hasBet = betAmt > 0;
                            const dx = 50 - pos.left;
                            const dy = 50 - pos.top;
                            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                            const pushX = (dx / dist) * 40;
                            const pushY = (dy / dist) * 34;

                            const remoteScale = Math.max(0.7, 1 - (n - 3) * 0.05);
                            const innerScale = isLocal
                                ? (isAct ? 1.04 : 1)
                                : (isAct ? 1.45 * remoteScale : remoteScale);

                            return (
                                <div key={p.id} style={{
                                    position:'absolute', left:`${pos.left}%`, top:`${pos.top}%`,
                                    transform:'translate(-50%, -50%)',
                                    zIndex: isAct ? 30 : 10
                                }}>
                                    <div style={{
                                        position:'relative',
                                        display:'flex', flexDirection:'column', alignItems:'center',
                                        transform:`scale(${innerScale})`,
                                        transformOrigin: isLocal ? 'center bottom' : 'center',
                                        transition:'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}>
                                        {/* Personal chip stack (remote players only) */}
                                        {p.stack > 0 && !isLocal && (
                                            <div style={{position:'absolute', right:'100%', bottom:18, width:14, marginRight:6}}>
                                                <ChipStackSVG amount={p.stack} maxChips={7} />
                                            </div>
                                        )}

                                        {/* Bet chips pushed toward pot */}
                                        {hasBet && (
                                            <div style={{
                                                position:'absolute', top:'50%', left:'50%',
                                                transform:`translate(calc(-50% + ${pushX}px), calc(-50% + ${pushY}px))`,
                                                pointerEvents:'none',
                                                transition:'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                                zIndex:1,
                                                display:'flex', flexDirection:'column', alignItems:'center'
                                            }}>
                                                <div style={{width:18}}>
                                                    <ChipStackSVG amount={betAmt} maxChips={6} />
                                                </div>
                                                <div style={{fontSize:9, fontWeight:800, color:'#fff', background:'rgba(0,0,0,0.7)', padding:'1px 5px', borderRadius:10, marginTop:2, border:`1px solid ${G}`, boxShadow:'0 2px 4px rgba(0,0,0,0.4)'}}>{betAmt}</div>
                                            </div>
                                        )}

                                        {/* Hole cards */}
                                        {!p.folded && phase !== 'preflop_start' && (
                                            <div style={{display:'flex', marginBottom:-6, marginTop:-14, zIndex:2, position:'relative', transform:'scale(0.58)', transformOrigin:'center bottom'}}>
                                                <HoleCard up={phase==='showdown'||phase==='end'||hasActed} />
                                                <HoleCard up={phase==='showdown'||phase==='end'||hasActed} />
                                            </div>
                                        )}

                                        {/* Local player pill */}
                                        {isLocal ? (
                                            <div className={`local-player-pill${isAct ? ' acting-ring-big' : ''}`} style={{
                                                width:110,
                                                background:`
                                                    repeating-linear-gradient(92deg,  rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 7px),
                                                    repeating-linear-gradient(88deg,  rgba(0,0,0,0.18)       0px, rgba(0,0,0,0.18)       1px, transparent 1px, transparent 11px),
                                                    repeating-linear-gradient(91deg,  rgba(255,220,140,0.07) 0px, rgba(255,220,140,0.07) 2px, transparent 2px, transparent 18px),
                                                    linear-gradient(160deg, #7a4a18 0%, #a0661e 18%, #6b3c10 30%, #b87333 42%, #7a4a18 55%, #9c5c1a 68%, #6b3c10 80%, #a07030 100%)`,
                                                borderStyle:'double',
                                                borderWidth:'4px 4px 0px',
                                                borderColor:'#ae861b',
                                                borderRadius:'14px 14px 0 0',
                                                padding:'15px 12px 10px',
                                                textAlign:'center',
                                                position:'relative',
                                                overflow:'hidden',
                                                opacity: p.inactive ? 0.55 : (p.folded ? 0.7 : 1),
                                                transition:'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                            }}>
                                                {/* Quarter-circle corner badges */}
                                                {i === sbI && <CornerBadge corner="tl" bg="#42a5f5" fg="#fff">SB</CornerBadge>}
                                                {i === bbI && <CornerBadge corner="tl" bg="#ef5350" fg="#fff">BB</CornerBadge>}
                                                {i === dealer && <CornerBadge corner="tr" bg="#fff" fg="#000">D</CornerBadge>}

                                                <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:2}}>
                                                    <div style={{width:9, height:9, borderRadius:'50%', background: p.inactive ? '#999' : PLAYER_COLORS[i % PLAYER_COLORS.length], boxShadow:`0 0 8px ${p.inactive ? 'transparent' : PLAYER_COLORS[i % PLAYER_COLORS.length]}`}}></div>
                                                    {p.inactive && <span style={{fontSize:10, fontWeight:700, color:'#888'}}>LEFT</span>}
                                                </div>
                                                <div style={{fontSize:19, fontWeight:900, color: p.folded || p.inactive ? DIM : G, letterSpacing:0.3, lineHeight:1.1}}>
                                                    {p.inactive ? '—' : p.stack}
                                                </div>
                                                {p.folded && !p.inactive && (
                                                    <div style={{position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%) rotate(-12deg)', background:'rgba(200,50,50,0.9)', color:'#fff', fontSize:10, fontWeight:900, padding:'2px 12px', borderRadius:4, border:'1px solid rgba(255,255,255,0.3)', pointerEvents:'none', letterSpacing:1}}>FOLDED</div>
                                                )}
                                            </div>
                                        ) : (
                                            /* Remote player strip */
                                            <div className={isAct ? 'acting-ring' : ''} style={{
                                                background: p.folded
                                                    ? 'rgba(0,0,0,0.55)'
                                                    : 'linear-gradient(180deg, rgba(20,32,24,0.95) 0%, rgba(12,22,16,0.92) 100%)',
                                                border:`1px solid ${isAct ? G : (p.folded || p.inactive ? 'rgba(255,255,255,0.08)' : 'rgba(93,64,55,0.55)')}`,
                                                borderRadius:10,
                                                padding:'5px 8px',
                                                position:'relative',
                                                boxShadow: isAct ? null : '0 4px 10px rgba(0,0,0,0.45)',
                                                opacity: p.inactive ? 0.5 : (p.folded ? 0.45 : 1),
                                                transition:'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap'
                                            }}>
                                                <div style={{width:7, height:7, borderRadius:'50%', background: p.inactive ? '#999' : PLAYER_COLORS[i % PLAYER_COLORS.length], boxShadow:`0 0 5px ${p.inactive ? 'transparent' : PLAYER_COLORS[i % PLAYER_COLORS.length]}`, flexShrink:0}}></div>
                                                <div style={{display:'flex', flexDirection:'column', minWidth:0}}>
                                                    <div style={{fontSize:10, fontWeight:700, color: p.folded ? 'rgba(255,255,255,0.45)' : '#fff', textDecoration: p.folded ? 'line-through' : 'none', maxWidth:72, overflow:'hidden', textOverflow:'ellipsis', lineHeight:1.15}}>{p.inactive ? 'LEFT' : p.name}</div>
                                                    <div style={{fontSize:9, fontWeight:800, color: p.folded || p.inactive ? DIM : G, lineHeight:1.1, letterSpacing:0.3}}>{p.inactive ? '—' : p.stack}</div>
                                                </div>
                                                {i === sbI && <PositionDot color="#42a5f5">SB</PositionDot>}
                                                {i === bbI && <PositionDot color="#ef5350">BB</PositionDot>}
                                                {i === dealer && <PositionDot color="#f0c040">D</PositionDot>}
                                                {p.folded && !p.inactive && <div style={{fontSize:8, fontWeight:900, color:'rgba(255,100,100,0.85)', lineHeight:1, letterSpacing:0.5}}>FOLD</div>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Rail: action + stacks + last action — rendered ONCE, CSS positions it ── */}
                <aside className="gt-rail">
                    <div className="wood-card rail-card">
                        <div className="wood-card__inner rail-card__inner">

                            {/* Section 1: action buttons or waiting strip */}
                            <div className="rail-section rail-section--actions">
                                {isBet && actP && (
                                    isMyTurn
                                        ? <RailActionBar toCall={toCall} raiseLabel={ba} canRaise={canRaiseBtn} onRaiseClick={()=>{if(canRaiseBtn)setRm(true);}} onCheck={doCheck} onCall={doCall} onFold={doFold} />
                                        : <RailWaitingStrip name={actP.name} />
                                )}
                            </div>

                            {/* Section 2: player stacks */}
                            <div className="rail-section rail-section--stacks">
                                <PlayerStacks
                                    players={players}
                                    dealer={dealer} sbI={sbI} bbI={bbI} actI={actI}
                                    myId={myId}
                                    sessionNum={sn}
                                    sessionsTotal={cfg.sessions}
                                />
                            </div>

                            {/* Section 3: last action */}
                            <div className="rail-section rail-section--last">
                                <LastActionPanel log={log} />
                            </div>

                        </div>
                    </div>
                </aside>

            </div>

            {/* ── Raise / Bet modal (fixed overlay, unchanged) ───────────── */}
            {rm && actP && (
                <div style={{position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
                    <div style={{maxWidth:400, width:'100%', background:'rgba(20,30,40,0.95)', borderRadius:16, padding:'20px 16px', border:'1px solid rgba(255,255,255,0.15)'}}>
                    {confirmingAllIn ? (
                        <>
                            <button onClick={()=>setConfirmingAllIn(false)} style={{background:'none',border:'none',color:DIM,fontSize:20,cursor:'pointer',padding:'0 0 10px 0',display:'block',lineHeight:1}}>←</button>
                            <div style={{textAlign:'center'}}>
                                <div style={{fontSize:30,marginBottom:8}}>⚠️</div>
                                <div style={{color:'#fff',fontSize:17,fontWeight:800,marginBottom:6}}>Confirm All-In</div>
                                <div style={{color:DIM,fontSize:13,marginBottom:20}}>You're wagering {actP.stack} chips.</div>
                                <Btn full bg="#b83200" onClick={()=>{doAllIn();setRm(false);}}>Confirm All-In</Btn>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{color:DIM,fontSize:13,marginBottom:4}}>{ba} amount (min: {lr})</div>
                            <input type="number" value={ra} onChange={e=>setRa(e.target.value)} placeholder={"Min "+lr} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:9,color:"#fff",padding:"10px 13px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box",marginBottom:8}}/>
                            <input type="range" min={lr} max={Math.max(lr, actP.stack - toCall)} value={ra||lr} onChange={e=>{setRa(e.target.value);setMc(true);}} style={{width:"100%",marginBottom:12, accentColor:"#f0c040", cursor:"pointer"}} />
                            <div style={{display:"flex",gap:6,marginBottom:8}}>
                                {!mc
                                    ? <Btn sm bg="#1a5c30" onClick={()=>{setRa(String(lr));setMc(true);}}>+{lr} (Min)</Btn>
                                    : <><Btn sm bg="#1a5c30" onClick={()=>setRa(String(Number(ra||0)+Math.floor(cfg.bb/2)))}>+{Math.floor(cfg.bb/2)}</Btn><Btn sm bg="#1a5c30" onClick={()=>setRa(String(Number(ra||0)+cfg.bb))}>+{cfg.bb}</Btn></>
                                }
                                <Btn sm bg="#b83200" onClick={()=>setConfirmingAllIn(true)}>All In ({actP.stack})</Btn>
                            </div>
                            <div style={{display:"flex",gap:8}}>
                                <Btn style={{flex:1}} bg="#b8880e" onClick={doRaise}>Confirm {ba}</Btn>
                                <Btn style={{flex:1}} bg="#444" onClick={()=>{setRm(false);setRa("");setMc(false);}}>Cancel</Btn>
                            </div>
                        </>
                    )}
                    </div>
                </div>
            )}

            {/* ── Phase modals (all unchanged) ────────────────────────────── */}

            {phase==="preflop_start" && <PhaseModal>
                <div style={{position:'relative', overflow:'hidden'}}>
                    <div style={{position:'absolute', top:'-50%', left:'-50%', width:'200%', height:'200%', background:'radial-gradient(circle at 50% 50%, rgba(240,192,64,0.08) 0%, transparent 60%)', zIndex:0, pointerEvents:'none'}}></div>
                    <div style={{position:'relative', zIndex:1, textAlign:'center'}}>
                        <div style={{display:'flex', justifyContent:'center', gap:10, marginBottom:16}}>
                            <div style={{fontSize:44, transform:'rotate(-10deg)', filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'}}>♥️</div>
                            <div style={{fontSize:44, transform:'rotate(10deg)', filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'}}>♠️</div>
                        </div>
                        <h2 style={{margin:"0 0 6px", fontSize:24, fontWeight:900, background:'linear-gradient(90deg, #f0c040 0%, #fff 50%, #f0c040 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', letterSpacing:1}}>THE PRE-FLOP</h2>
                        <p style={{color:'#ddd', fontSize:14, margin:"0 0 20px", fontWeight:500}}>Cards are dealt. Action is on!</p>
                        <div style={{background:"rgba(0,0,0,0.4)", border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:16, marginBottom:20, textAlign:"left", boxShadow:'inset 0 2px 10px rgba(0,0,0,0.5)'}}>
                            <div style={{fontSize:11, color:DIM, marginBottom:14, letterSpacing:1.5, textTransform:'uppercase', fontWeight:800, textAlign:'center'}}>Table Positions</div>
                            <div style={{display:'flex', flexDirection:'column', gap:12}}>
                                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                                        <span style={{background:'linear-gradient(135deg, #eee, #999)', color:'#000', borderRadius:'50%', width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, boxShadow:'0 2px 5px rgba(0,0,0,0.5)'}}>D</span>
                                        <span style={{color:'#ccc', fontWeight:600, fontSize:14}}>Dealer</span>
                                    </div>
                                    <span style={{color:'#fff', fontWeight:800, fontSize:15}}>{players[dealer]&&players[dealer].name}</span>
                                </div>
                                <div style={{height:1, background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'}}></div>
                                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                                        <span style={{background:'linear-gradient(135deg, #42a5f5, #1565c0)', color:'#fff', borderRadius:'50%', width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, boxShadow:'0 2px 5px rgba(0,0,0,0.5)'}}>SB</span>
                                        <span style={{color:'#ccc', fontWeight:600, fontSize:14}}>Small Blind</span>
                                    </div>
                                    <div style={{textAlign:'right'}}>
                                        <div style={{color:'#fff', fontWeight:800, fontSize:15}}>{players[sbI]&&players[sbI].name}</div>
                                        <div style={{color:'#64b5f6', fontSize:12, fontWeight:700}}>{cfg.sb} chips</div>
                                    </div>
                                </div>
                                <div style={{height:1, background:'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'}}></div>
                                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                                        <span style={{background:'linear-gradient(135deg, #ef5350, #c62828)', color:'#fff', borderRadius:'50%', width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, boxShadow:'0 2px 5px rgba(0,0,0,0.5)'}}>BB</span>
                                        <span style={{color:'#ccc', fontWeight:600, fontSize:14}}>Big Blind</span>
                                    </div>
                                    <div style={{textAlign:'right'}}>
                                        <div style={{color:'#fff', fontWeight:800, fontSize:15}}>{players[bbI]&&players[bbI].name}</div>
                                        <div style={{color:'#ef5350', fontSize:12, fontWeight:700}}>{cfg.bb} chips</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {isDealer ? (
                            <Btn full bg="linear-gradient(180deg, #388e3c 0%, #1b5e20 100%)" onClick={()=>emitAction('reveal')} style={{padding:'14px 0', fontSize:15, fontWeight:900, letterSpacing:1, textTransform:'uppercase', boxShadow:'0 6px 20px rgba(27,94,32,0.6)', border:'1px solid #4caf50', borderRadius:12}}>Start the Round</Btn>
                        ) : (
                            <div style={{padding:'12px 0',color:DIM,fontSize:14}}>
                                <div style={{fontSize:24,marginBottom:8}}>⏳</div>
                                Waiting for <span style={{color:G,fontWeight:700}}>{players[dealer]&&players[dealer].name}</span> (Dealer) to start the round...
                            </div>
                        )}
                    </div>
                </div>
            </PhaseModal>}

            {rvli && <PhaseModal>
                <div style={{position:'relative', overflow:'hidden', textAlign:'center'}}>
                    <div style={{position:'absolute', top:'-50%', left:'-50%', width:'200%', height:'200%', background:'radial-gradient(circle at 50% 50%, rgba(80,140,255,0.08) 0%, transparent 60%)', zIndex:0, pointerEvents:'none'}}></div>
                    <div style={{position:'relative', zIndex:1}}>
                        <div style={{fontSize:52, marginBottom:16, filter:'drop-shadow(0 4px 10px rgba(80,140,255,0.4))'}}>{rvli.i}</div>
                        <h2 style={{margin:"0 0 8px", fontSize:26, fontWeight:900, background:'linear-gradient(90deg, #64b5f6 0%, #fff 50%, #64b5f6 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', letterSpacing:2}}>{rvli.t}</h2>
                        <p style={{color:'#ddd', fontSize:15, margin:"0 0 24px", fontWeight:500}}>{rvli.s}</p>
                        {isDealer ? (
                            <Btn full bg="linear-gradient(180deg, #1976d2 0%, #0d47a1 100%)" onClick={proceedReveal} style={{padding:'14px 0', fontSize:15, fontWeight:900, letterSpacing:1, textTransform:'uppercase', boxShadow:'0 6px 20px rgba(13,71,161,0.6)', border:'1px solid #42a5f5', borderRadius:12}}>Reveal Cards</Btn>
                        ) : (
                            <div style={{padding:'12px 0',color:DIM,fontSize:14}}>
                                <div style={{fontSize:24,marginBottom:8}}>⏳</div>
                                Waiting for <span style={{color:G,fontWeight:700}}>{players[dealer]&&players[dealer].name}</span> (Dealer) to reveal cards...
                            </div>
                        )}
                    </div>
                </div>
            </PhaseModal>}

            {phase==="showdown" && <PhaseModal>
                <div style={{marginBottom:8}}></div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><p style={{color:G,fontWeight:700,margin:0}}>SHOWDOWN</p>{cp.length>1&&<span style={{fontSize:12,color:DIM}}>Pot {pi+1}/{cp.length}</span>}</div>
                {cp.length>1&&<div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>{cp.map((p,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11,borderRadius:6,padding:"3px 8px",fontWeight:700,background:i===pi?(i===0?"rgba(240,192,64,0.25)":"rgba(160,100,240,0.25)"):"rgba(255,255,255,0.06)",color:i===pi?(i===0?G:"#c8a0ff"):DIM}}><span>{p.label}: {p.amount}</span><div style={{display:'flex',gap:2}}>{p.eligible.map(ep=>{const pIdx=players.findIndex(pl=>pl.id===ep.id);return pIdx>=0&&<div key={ep.id} style={{width:6,height:6,borderRadius:'50%',background:PLAYER_COLORS[pIdx%PLAYER_COLORS.length]}}></div>;})}</div></div>)}</div>}
                {potAward ? (
                    <div style={{textAlign:'center'}}>
                        <div style={{fontSize:36,marginBottom:8}}>🏆</div>
                        <p style={{color:G,fontWeight:800,fontSize:17,margin:'0 0 4px'}}>{potAward.name} wins!</p>
                        <p style={{color:DIM,fontSize:13,margin:'0 0 4px'}}>{potAward.label}</p>
                        <p style={{color:'#fff',fontSize:20,fontWeight:800,margin:'0 0 4px'}}>{potAward.amt} chips</p>
                        {potAward.hr && <p style={{color:'#64b5f6',fontSize:14,margin:'0 0 12px'}}>({potAward.hr})</p>}
                        {(()=>{
                            const dealerPlayerId = players[dealer]?.id;
                            const totalApproversForThisPot = (cp[pi]?.eligible || [])
                                .filter(p => p.id !== dealerPlayerId && !p.folded && !p.inactive)
                                .length;
                            return isDealer ? (
                                <div>
                                    {totalApproversForThisPot === 0
                                        ? <div style={{color:DIM,fontSize:12,marginBottom:8}}>No approval needed — only {players[dealer]?.name} is eligible.</div>
                                        : <div style={{color:DIM,fontSize:12,marginBottom:8}}>Approved: {confirmed.length}/{totalApproversForThisPot}</div>
                                    }
                                    <Btn full bg="#1976d2" onClick={()=>emitAction('next_pot')} dis={confirmed.length < totalApproversForThisPot}>{pi > 0 ? ('Proceed to ' + (cp[pi-1] ? cp[pi-1].label : 'Next Pot')) : 'Finish Distribution'}</Btn>
                                </div>
                            ) : (
                                <div style={{marginTop:10}}>
                                    {(potAward.eligibleIds||[]).includes(myId) ? (
                                        myConfirmed ? (
                                            <Btn full bg="#333" dis>✅ Approved {confirmed.length}/{totalApproversForThisPot}</Btn>
                                        ) : (
                                            <div style={{display:'flex',gap:8}}>
                                                <Btn style={{flex:1}} bg="#1976d2" onClick={()=>socket.emit('confirm_result')}>Approve {confirmed.length}/{totalApproversForThisPot}</Btn>
                                                <Btn bg="#7a1a1a" onClick={()=>socket.emit('dissent_result')}>Dissent</Btn>
                                            </div>
                                        )
                                    ) : (
                                        <div style={{color:DIM,fontSize:13}}>⏳ Waiting for players to approve...</div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    cpd ? (
                        isDealer ? (<>
                            <p style={{color:DIM,fontSize:13,marginBottom:10}}>Award <b style={{color:pi===0?G:"#c8a0ff"}}>{cpd.label} ({cpd.amount})</b></p>
                            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:8}}>
                                {cpd.eligible.map(p=>{const isAI=ai.includes(p.id);const pIdx=players.findIndex(pl=>pl.id===p.id);return(<button key={p.id} onClick={()=>setCdlg({type:"winner",id:p.id,name:p.name,label:cpd.label,amt:cpd.amount})} style={{background:isAI?"rgba(122,26,122,0.15)":"rgba(240,192,64,0.1)",border:isAI?"1px solid rgba(160,100,240,0.4)":"1px solid rgba(240,192,64,0.4)",borderRadius:12,color:"#fff",padding:"12px 15px",fontSize:14,fontWeight:700,cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:'flex',alignItems:'center'}}><div style={{width:10,height:10,borderRadius:'50%',background:PLAYER_COLORS[pIdx%PLAYER_COLORS.length],marginRight:8}}></div><span>{p.name}{isAI&&<span style={{fontSize:11,color:"#c8a0ff",marginLeft:5}}>[AI]</span>}</span></div><span style={{color:isAI?"#c8a0ff":G}}>{p.stack}</span></button>);})}
                            </div>
                            {cpd.eligible.length>1&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
                                <Btn full bg="rgba(80,140,255,0.15)" onClick={()=>setCdlg({type:"split",eligible:cpd.eligible,amt:cpd.amount,label:cpd.label,names:cpd.eligible.map(e=>e.name).join(" & ")})}>🤝 Split Between All Remaining</Btn>
                                <Btn full bg="rgba(80,140,255,0.08)" onClick={()=>{setSsel([]);setSseld({eligible:cpd.eligible,amt:cpd.amount,label:cpd.label});}}>✂️ Split Between Selected Players</Btn>
                            </div>}
                        </>) : (
                            <div style={{textAlign:'center',padding:'20px 0',color:DIM,fontSize:14}}>
                                <div style={{fontSize:32,marginBottom:10}}>🃏</div>
                                <p style={{color:'#fff',fontWeight:700,margin:'0 0 5px'}}>Showdown in Progress</p>
                                Waiting for <span style={{color:G,fontWeight:700}}>{players[dealer]&&players[dealer].name}</span> (Dealer) to select the winner...
                            </div>
                        )
                    ) : null
                )}
            </PhaseModal>}

            {phase==="end" && wi && <PhaseModal>
                <div style={{textAlign:"center"}}>
                    <div style={{fontSize:38,marginBottom:6}}>🏆</div>
                    <p style={{color:G,fontWeight:800,fontSize:19,margin:"0 0 4px"}}>{wi.name} wins!</p>
                    <p style={{color:DIM,margin:"0 0 12px"}}>+{wi.amt} chips{wi.hr && <span style={{marginLeft:8,color:'#64b5f6'}}>({wi.hr})</span>}</p>
                    <Card>{sortedSt.map((p,i)=><div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}><span>{MED[i]} {p.name}</span><span style={{color:G,fontWeight:700}}>{p.stack}</span></div>)}</Card>
                    <div style={{background:'rgba(0,0,0,0.3)',padding:'10px 15px',borderRadius:10,marginBottom:12}}>
                        <div style={{color:DIM,fontSize:11,textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Next Hand's Dealer</div>
                        <div style={{color:G,fontWeight:800,fontSize:16}}>{players[(dealer+1)%n] && players[(dealer+1)%n].name}</div>
                    </div>
                    {isDealer ? (
                        <Btn full onClick={()=>emitAction('next_hand')}>Next Hand</Btn>
                    ) : (
                        <div style={{padding:'10px 0',color:DIM,fontSize:14}}>
                            <div style={{fontSize:20,marginBottom:6}}>⏳</div>
                            Waiting for <span style={{color:G,fontWeight:700}}>{players[dealer]&&players[dealer].name}</span> (Dealer) to start next hand...
                        </div>
                    )}
                </div>
            </PhaseModal>}

            {phase==="session_end" && sei && <PhaseModal>
                <div style={{textAlign:"center",marginBottom:16}}>
                    <div style={{fontSize:40}}>📊</div>
                    <h2 style={{color:G,margin:"5px 0 2px"}}>SESSION {sn} OVER</h2>
                    <p style={{color:DIM,margin:0,fontSize:13}}>{sei.rankings[sei.rankings.length-1].name} went bankrupt!</p>
                </div>
                <Card><p style={{color:G,fontWeight:700,marginTop:0,marginBottom:10}}>Session Rankings</p>{sei.rankings.map((p,i)=>{const pt=sei.pts[p.id]||0;return(<div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:10,marginBottom:4,background:i===0?"rgba(240,192,64,0.1)":"rgba(255,255,255,0.04)",border:i===0?"1px solid rgba(240,192,64,0.3)":"1px solid transparent"}}><span>{MED[i]} {p.name}</span><div><span style={{color:G,fontWeight:700}}>+{pt} pts</span><span style={{color:DIM,fontSize:12,marginLeft:8}}>({p.stack} chips)</span></div></div>);})}</Card>
                <button onClick={()=>setShowCumulative(c=>!c)} style={{width:'100%',background:'#444',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,padding:'8px 0',cursor:'pointer',marginBottom:8}}>{showCumulative?'Hide Cumulative Scores':'View Cumulative Scores'}</button>
                {showCumulative&&<Card><p style={{color:G,fontWeight:700,marginTop:0,marginBottom:8}}>Cumulative Scores</p>{players.slice().sort((a,b)=>(sei.ns[b.id]||0)-(sei.ns[a.id]||0)).map((p,i)=><div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}><span>{MED[i]} {p.name}</span><span style={{color:G,fontWeight:700}}>{sei.ns[p.id]||0} pts</span></div>)}</Card>}
                <div style={{display:"flex",gap:8}}>
                    {sn<cfg.sessions ? (isHost ? <Btn full onClick={nextSession}>Next Session ({sn+1}/{cfg.sessions}) →</Btn> : <div style={{flex:1,textAlign:'center',color:DIM,fontSize:13,padding:'8px 0'}}>⏳ Waiting for host to start next session...</div>) : null}
                    <Btn bg="#333" onClick={()=>setShowStats(true)}>📊</Btn>
                </div>
                {showStats&&<StatsMod hist={history} pls={players} scores={sei.ns} onClose={()=>setShowStats(false)}/>}
            </PhaseModal>}

        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function shade(hex, lum) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const num = parseInt(m[1], 16);
    let r = (num >> 16) + lum, g = (num >> 8 & 0xff) + lum, b = (num & 0xff) + lum;
    return '#' + (
        (Math.max(0, Math.min(255, r)) << 16 |
         Math.max(0, Math.min(255, g)) << 8  |
         Math.max(0, Math.min(255, b))).toString(16).padStart(6, '0')
    );
}

function PositionDot({ color, children }) {
    return (
        <div style={{
            fontSize:8, fontWeight:900, color,
            background:`${color}1f`,
            border:`1px solid ${color}55`,
            borderRadius:4,
            padding:'1px 4px',
            lineHeight:1,
            letterSpacing:0.3
        }}>{children}</div>
    );
}

function CornerBadge({ corner, bg, fg, children }) {
    const isLeft = corner === 'tl';
    return (
        <div style={{
            position:'absolute', top:0, [isLeft ? 'left' : 'right']: 0,
            background:bg, color:fg,
            width:26, height:26,
            borderRadius: isLeft ? '0 0 26px 0' : '0 0 0 26px',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:9, fontWeight:900,
            paddingBottom:4,
            [isLeft ? 'paddingRight' : 'paddingLeft']: 4,
            boxSizing:'border-box',
            letterSpacing:0.3
        }}>{children}</div>
    );
}

function ActionButton({ color, primary, secondary, onClickFn, cornerLeft, cornerRight, disabled }) {
    const [hover, setHover] = React.useState(false);
    return (
        <button
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={disabled ? null : onClickFn}
            style={{
                flex:1,
                background: disabled
                    ? '#555'
                    : hover
                        ? `linear-gradient(180deg, ${shade(color, 8)} 0%, ${color} 100%)`
                        : `linear-gradient(180deg, ${color} 0%, ${shade(color, -16)} 100%)`,
                border:'none',
                color:'#fff',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                borderRadius: cornerLeft ? '0 0 0 14px' : cornerRight ? '0 0 14px 0' : 0,
                display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center',
                gap:1,
                transition:'background 120ms ease, transform 80ms ease',
                transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow:'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.25)',
                padding:'0 8px'
            }}
        >
            <div style={{fontSize:15, fontWeight:800, letterSpacing:0.5, lineHeight:1.15}}>{primary}</div>
            {secondary && <div style={{fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.78)', letterSpacing:0.3, lineHeight:1}}>{secondary}</div>}
        </button>
    );
}

function RailActionBar({ toCall, raiseLabel, canRaise, onRaiseClick, onCheck, onCall, onFold }) {
    return (
        <div style={{
            display:'flex',
            height:56,
            margin:'-10px -12px 0 -12px',
            borderTopLeftRadius:'inherit',
            borderTopRightRadius:'inherit',
            borderBottom:'1px solid rgba(240,192,64,0.18)',
            overflow:'hidden'
        }}>
            <ActionButton
                color="#1565c0"
                primary={toCall === 0 ? 'Check' : 'Call'}
                secondary={toCall === 0 ? null : String(toCall)}
                onClickFn={toCall === 0 ? onCheck : onCall}
                cornerLeft
            />
            <ActionButton
                color={canRaise ? "#b8880e" : "#555"}
                primary={raiseLabel || 'Raise'}
                secondary={null}
                onClickFn={onRaiseClick}
                disabled={!canRaise}
            />
            <ActionButton
                color="#8b1a1a"
                primary="Fold"
                secondary={null}
                onClickFn={onFold}
                cornerRight
            />
        </div>
    );
}

function RailWaitingStrip({ name }) {
    return (
        <div style={{
            height:56,
            background:'linear-gradient(180deg, rgba(10,5,2,0.95) 0%, rgba(20,12,6,0.95) 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            color:DIM_STRONG, fontSize:13,
            margin:'-10px -12px 0 -12px',
            borderTopLeftRadius:'inherit',
            borderTopRightRadius:'inherit',
            borderBottom:'1px solid rgba(240,192,64,0.18)',
            gap:8
        }}>
            <span style={{width:6, height:6, borderRadius:'50%', background:G, boxShadow:`0 0 8px ${G}`, display:'inline-block', animation:'actingPulse 1.6s ease-in-out infinite'}} />
            Waiting for <span style={{color:G, fontWeight:700, marginLeft:4}}>{name}</span>
        </div>
    );
}

function PlayerStacks({ players, dealer, sbI, bbI, actI, myId, sessionNum, sessionsTotal }) {
    return (
        <div style={{display:'flex', flexDirection:'column', height:'100%', minHeight:0}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexShrink:0}}>
                <div style={{color:G, fontWeight:800, fontSize:10, letterSpacing:1.2, textTransform:'uppercase'}}>Stacks</div>
                <div style={{fontSize:9, color:DIM_STRONG, letterSpacing:0.5, fontWeight:600, textTransform:'uppercase'}}>Session {sessionNum}/{sessionsTotal}</div>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:3, flex:'1 1 auto', minHeight:0}}>
                {players.map((p, i) => {
                    const isMe = p.id === myId;
                    const isAct = i === actI;
                    const posTag =
                        i === dealer ? { l:'D',  c:'#f0c040' } :
                        i === sbI    ? { l:'SB', c:'#42a5f5' } :
                        i === bbI    ? { l:'BB', c:'#ef5350' } : null;
                    return (
                        <div key={p.id} style={{
                            display:'flex', alignItems:'center', gap:8,
                            padding:'0 8px',
                            borderRadius:6,
                            background: isAct ? 'rgba(240,192,64,0.14)' : isMe ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.22)',
                            border: isAct ? '1px solid rgba(240,192,64,0.55)' : '1px solid transparent',
                            opacity: p.folded ? 0.45 : 1,
                            transition:'all 200ms ease',
                            flex:'0 1 32px',
                            minHeight:22
                        }}>
                            <div style={{width:7, height:7, borderRadius:'50%', background:PLAYER_COLORS[i % PLAYER_COLORS.length], boxShadow:`0 0 5px ${PLAYER_COLORS[i % PLAYER_COLORS.length]}`, flexShrink:0}} />
                            <div style={{flex:1, minWidth:0, display:'flex', alignItems:'center', gap:6}}>
                                <div style={{fontSize:12, fontWeight: isMe ? 800 : 600, color: p.folded ? DIM : '#fff', textDecoration: p.folded ? 'line-through' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:0.2}}>{p.name}</div>
                                {posTag && <div style={{fontSize:8, fontWeight:900, color:posTag.c, background:`${posTag.c}1f`, border:`1px solid ${posTag.c}55`, borderRadius:3, padding:'1px 4px', letterSpacing:0.3, lineHeight:1, flexShrink:0}}>{posTag.l}</div>}
                            </div>
                            <div style={{fontSize:12, fontWeight:800, color: p.folded ? DIM : G, letterSpacing:0.3, fontVariantNumeric:'tabular-nums'}}>{p.stack}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function classifyAction(line) {
    if (!line) return 'idle';
    const lc = line.toLowerCase();
    if (lc.includes('all in'))   return 'allin';
    if (lc.includes('re-raise')) return 'reraise';
    if (lc.includes('raise'))    return 'raise';
    if (lc.includes('bet'))      return 'bet';
    if (lc.includes('call'))     return 'call';
    if (lc.includes('check'))    return 'check';
    if (lc.includes('fold'))     return 'fold';
    if (lc.includes('flop') || lc.includes('turn') || lc.includes('river')) return 'deal';
    return 'idle';
}

function LastActionPanel({ log }) {
    const last = (log || []).find(l => /all in|raise|bet|call|check|fold|flop|turn|river/i.test(l))
                 ?? (log?.[0] ?? null);
    const tone = classifyAction(last);
    const s = TONE_STYLES[tone] || TONE_STYLES.idle;

    const m = last && last.match(/^([A-Z][a-zA-Z]+)\s+(\w+)(?:\s+(?:to\s+)?([\d,]+))?/);
    const who  = m ? m[1] : null;
    const verb = m ? m[2] : (last || '—');
    const amt  = m ? m[3] : null;

    return (
        <div style={{
            background:s.bg,
            boxShadow:s.glow,
            padding:'12px 26px 16px 26px',
            transition:'background 300ms ease, box-shadow 300ms ease',
            margin:'0 -12px -10px -12px',
            borderTop:`1px solid ${s.border}`,
            borderBottomLeftRadius:'inherit',
            borderBottomRightRadius:'inherit'
        }}>
            <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:4}}>
                <div style={{fontSize:9, fontWeight:800, letterSpacing:1.2, color:'rgba(255,255,255,0.55)', textTransform:'uppercase'}}>Last Action</div>
                <div style={{fontSize:9, fontWeight:900, letterSpacing:1, color:s.accent, textTransform:'uppercase'}}>{s.label}</div>
            </div>
            <div style={{display:'flex', alignItems:'baseline', gap:6, fontSize:15, fontWeight:800, color:'#fff', letterSpacing:0.2, lineHeight:1.2}}>
                {who  && <span style={{color:'#fff'}}>{who}</span>}
                <span style={{color:s.accent, textTransform:'lowercase'}}>{verb}</span>
                {amt  && <span style={{marginLeft:'auto', color:s.accent, fontVariantNumeric:'tabular-nums'}}>{amt}</span>}
            </div>
        </div>
    );
}
