import React, { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';
import PhaseModal from './PhaseModal';
import { Btn, Card, Fld, Ov, DB, SR, SS, HoleCard, CommCard, getCommunityCards, AnimatedSidePot, CDlg, SSDlg, HRDlg, StatsMod, ChipStackSVG, PLAYER_COLORS, G, SV, BR, DIM, MED, NP, PL, RVLI, buildPots, HandRankModal } from './UI';

// Returns {left, top} percentage coordinates for each seat.
// Index 0 is always the local player (bottom-center).
// Remaining indices follow turn order clockwise.
function getSeatPositions(n) {
    if (n <= 1) return [{ left: 50, top: 92 }];
    if (n === 2) return [
        { left: 50, top: 92 },
        { left: 50, top: 10 },
    ];
    if (n === 3) return [
        { left: 50, top: 92 },
        { left: 18, top: 15 },
        { left: 82, top: 15 },
    ];
    // 4+ players: bottom + left + top-row(n-3) + right
    const pts = [
        { left: 50, top: 92 },
        { left: 14, top: 48 },
    ];
    const topCount = n - 3;
    for (let i = 0; i < topCount; i++) {
        const lx = topCount === 1 ? 50 : 18 + (i / (topCount - 1)) * 64;
        pts.push({ left: Math.round(lx), top: 10 });
    }
    pts.push({ left: 86, top: 48 });
    return pts;
}

const POT_COLORS = [
    { bg: 'rgba(240,192,64,0.18)',  border: 'rgba(240,192,64,0.5)',  amt: '#f0c040' },  // gold  (main)
    { bg: 'rgba(80,180,220,0.18)',  border: 'rgba(80,180,220,0.5)',  amt: '#50b4dc' },  // cyan
    { bg: 'rgba(180,100,240,0.18)', border: 'rgba(180,100,240,0.5)', amt: '#b464f0' },  // purple
    { bg: 'rgba(120,200,100,0.18)', border: 'rgba(120,200,100,0.5)', amt: '#78c864' },  // green
    { bg: 'rgba(255,140,60,0.18)',  border: 'rgba(255,140,60,0.5)',  amt: '#ff8c3c' },  // orange
];

export default function GameTable({ gameState, emitAction, socket, myId, isHost, onLeave }) {
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
    const [showHomeDlg, setShowHomeDlg] = useState(false);
    const [showUndoDlg, setShowUndoDlg] = useState(false);
    const [showHandRank, setShowHandRank] = useState(false);
    const [showCumulative, setShowCumulative] = useState(false);
    const [confirmingAllIn, setConfirmingAllIn] = useState(false);

    useEffect(() => { setShowCumulative(false); }, [sn]);
    useEffect(() => { setConfirmingAllIn(false); }, [rm]);

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

    const handleHome = () => { setShowHomeDlg(true); };
    const doEndGame = (save) => {
        setShowHomeDlg(false);
        socket.emit('host_end_game', { save }, () => { if (onLeave) onLeave(); });
    };
    const doLeave = () => {
        setShowHomeDlg(false);
        socket.emit('player_leave_game', (res) => { if (res.success && onLeave) onLeave(); });
    };
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

        // ── Countdown active ──
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

        // ── A player left from game-over screen ──
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

        // ── Scoreboard sub-view ──
        if(goView==="scores")return(<div style={{padding:20}}><div style={{maxWidth:460,margin:"0 auto"}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 0 10px"}}><button onClick={()=>setGoView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button><h2 style={{color:G,margin:0}}>Final Scoreboard</h2></div><Card>{gs.map((p,i)=>{const clr=i===0?G:i===1?SV:i===2?BR:i===li?"#ff3333":"#fff";return(<div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 4px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span style={{color:clr,fontWeight:i===0?800:400}}>{i===0?"👑 ":""}{MED[i]} {p.name}</span><span style={{color:clr,fontWeight:700}}>{scores[p.id]||0} pts</span></div>);})}</Card>{showStats&&<StatsMod hist={history} pls={players} scores={scores} onClose={()=>setShowStats(false)}/>}</div></div>);

        // ── Host confirming overlay ──
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

        // ── Main game-over view ──
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

    const pg={minHeight:"100vh",background:"radial-gradient(circle at center, #3e2723 0%, #1a0f0a 100%)",color:"#fff",padding:"6px 14px 14px",fontFamily:"'Segoe UI',sans-serif",boxSizing:"border-box"};
    const wp={maxWidth:460,margin:"0 auto"};
    const sortedSt=players.slice().sort((a,b)=>b.stack-a.stack);

    return(<div style={pg}><div style={wp}>
        {showStats&&<StatsMod hist={history} pls={players} scores={scores} onClose={()=>setShowStats(false)}/>}
        {showHandRank&&<HandRankModal onClose={()=>setShowHandRank(false)}/>}
        {cdlg&&<CDlg d={cdlg} onClose={()=>setCdlg(null)} onConfirm={doConfirm}/>}
        {hrd&&<HRDlg d={hrd} onSelect={hr=>{const w=hrd.wi;setHrd(null);finalWin(w,hr);}} setTier={t=>setHrd({...hrd,tier:t})} onSkip={()=>{const w=hrd.wi;setHrd(null);finalWin(w,null);}}/>}
        {sseld&&<SSDlg d={sseld} sel={ssel} setSel={setSsel} onClose={()=>{setSseld(null);setSsel([]);}} onSplit={(e,a,l)=>{const names=e.map(x=>x.name).join(" & ");setSseld(null);setSsel([]);setCdlg({type:"split",eligible:e,amt:a,label:l,names});}}/>}

        {showHomeDlg && isHost && <Ov><DB><div style={{textAlign:'center'}}>
          <div style={{fontSize:36,marginBottom:10}}>💾</div>
          <p style={{color:G,fontWeight:800,fontSize:17,margin:'0 0 8px'}}>End the room for everyone?</p>
          <p style={{color:DIM,fontSize:13,margin:'0 0 20px'}}>This will end the game for all players.</p>
          <div style={{display:'flex',gap:10}}>
            <Btn full bg="#1a7a40" onClick={()=>doEndGame(true)}>Save & Leave</Btn>
            <Btn full bg="#7a1a1a" onClick={()=>doEndGame(false)}>Leave No Save</Btn>
          </div>
          <div style={{marginTop:10}}><Btn full bg="rgba(255,255,255,0.1)" onClick={()=>setShowHomeDlg(false)}>Cancel</Btn></div>
        </div></DB></Ov>}
        {showHomeDlg && !isHost && <ConfirmDialog title="Leave the game?" body="You'll be marked inactive for the rest of this session and any following sessions in this room. Your remaining chips stay on the table." confirmLabel="Yes, leave" confirmBg="#7a1a1a" onConfirm={doLeave} onCancel={()=>setShowHomeDlg(false)} />}
        {showUndoDlg && <ConfirmDialog title="Undo last action?" body="This will roll back the most recent move. All players will see the change." confirmLabel="Yes, undo" confirmBg="#b8680e" onConfirm={()=>{ setShowUndoDlg(false); handleUndo(); }} onCancel={()=>setShowUndoDlg(false)} />}

        {/* ── Status header ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div><div style={{fontSize:11,color:DIM}}>SESSION {sn}/{cfg.sessions} · HAND #{hn}</div><div style={{fontSize:18,fontWeight:800,color:G}}>{PL[phase]||phase}</div></div>
          <div style={{display:'flex', gap: 6, alignItems:'center'}}>
              <button onClick={handleHome} style={{background:'rgba(255,100,100,0.1)',border:'1px solid rgba(255,100,100,0.3)',borderRadius:'50%',width:32,height:32,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>🏠</button>
              {isHost && <button onClick={() => setShowUndoDlg(true)} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:'50%',width:32,height:32,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>↩️</button>}
              {isHost && <button onClick={()=>socket.emit('save_game',(res)=>{if(res.success)alert('Game saved! ID: '+res.saveId);else alert('Save failed: '+res.message);})} style={{background:'rgba(100,180,100,0.15)',border:'1px solid rgba(100,180,100,0.4)',borderRadius:'50%',width:32,height:32,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>💾</button>}
              <button onClick={()=>setShowHandRank(true)} style={{background:'rgba(240,192,64,0.12)',border:'1px solid rgba(240,192,64,0.35)',borderRadius:'50%',width:32,height:32,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>🃏</button>
              <button onClick={()=>setShowStats(true)} style={{background:'rgba(240,192,64,0.2)',border:'1px solid rgba(240,192,64,0.4)',borderRadius:'50%',width:32,height:32,fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0}}>📊</button>
              <Btn sm bg="rgba(255,255,255,0.12)" onClick={()=>setShowSt(s=>!s)}>Stacks</Btn>
          </div>
        </div>

        {/* ── Poker table felt ── */}
        <div className="poker-table-bg" style={{position:'relative', isolation:'isolate'}}>
            {/* Community Cards — flop on bottom row, turn+river on top row */}
            {(()=>{
                const cards = getCommunityCards(phase);
                const flop = cards.slice(0, 3);
                const tr = cards.slice(3);
                const flopScale = tr.length > 0 ? 0.7 : 1;
                return (
                    <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:6, position:'relative', zIndex:25, alignItems:'center', minHeight:52}}>
                        {tr.length > 0 && (
                            <div style={{display:'flex', gap:6, justifyContent:'center'}}>
                                {tr.map((card, i) => {
                                    const sc = i < tr.length - 1 ? 0.7 : 1;
                                    return (
                                        <div key={i+3} style={{transform:`scale(${sc})`, transition:'transform 270ms ease', transformOrigin:'bottom center'}}>
                                            <CommCard up={card.up} rank={card.rank} suit={card.suit} red={card.red} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {flop.length > 0 && (
                            <div style={{display:'flex', gap:6, justifyContent:'center'}}>
                                {flop.map((card, i) => (
                                    <div key={i} style={{transform:`scale(${flopScale})`, transition:'transform 270ms ease', transformOrigin:'bottom center'}}>
                                        <CommCard up={card.up} rank={card.rank} suit={card.suit} red={card.red} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            <div style={{position:'relative', zIndex:25, display:'flex', flexDirection:'column', alignItems:'center'}}>
            {(()=>{
                const rawPots = cp.length > 0 ? cp : buildPots(players, hc, ai);
                const safePots = rawPots.length > 0 ? rawPots : [{ amount: pot, eligible: players.filter(p=>!p.folded), label: 'Main' }];
                const renderPill = (p, i) => {
                    const clr = i === 0 ? POT_COLORS[0] : POT_COLORS[((i - 1) % 4) + 1];
                    return (
                        <div key={i} style={{width:110,background:clr.bg,border:`1px solid ${clr.border}`,borderRadius:14,padding:'6px 10px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',boxSizing:'border-box'}}>
                            <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:1}}>{p.label||(i===0?'Main':`Side ${i}`)}</div>
                            <div style={{fontSize:13,fontWeight:800,color:clr.amt,lineHeight:1.2}}>{p.amount}</div>
                            <div style={{display:'flex',gap:3,justifyContent:'center',marginTop:3,flexWrap:'wrap'}}>
                                {(p.eligible||[]).slice(0,6).map(ep=>{const pIdx=players.findIndex(pl=>pl.id===ep.id);return pIdx>=0?<div key={ep.id} style={{width:5,height:5,borderRadius:'50%',background:PLAYER_COLORS[pIdx%PLAYER_COLORS.length]}}></div>:null;})}
                            </div>
                        </div>
                    );
                };
                const buildRows = (count) => {
                    if (count <= 1) return [[0]];
                    if (count === 2) return [[0,1]];
                    if (count === 3) return [[0,1],[2]];
                    if (count === 4) return [[0,1],[2,3]];
                    const rows = [];
                    for (let i = 0; i < count; i += 3) rows.push([i,i+1,i+2].filter(j=>j<count));
                    return rows;
                };
                const rows = buildRows(safePots.length);
                return (
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                        {rows.map((row, ri) => (
                            <div key={ri} style={{display:'flex',justifyContent:'center',gap:8}}>
                                {row.map(idx => renderPill(safePots[idx], idx))}
                            </div>
                        ))}
                    </div>
                );
            })()}
            </div>

            {/* Players — rendered in perspective order */}
            {players.map((_, j) => {
                const i = (myLocalIdx + j) % n;   // original array index
                const p = players[i];
                const pos = seatPositions[j] || { left: 50, top: 50 };
                const isAct = i === actI && isBet;
                const hasActed = isBet && !queue.includes(i);
                const isAI = ai.includes(p.id);

                const betAmt = rBets[i] || 0;
                const hasBet = betAmt > 0;
                // Push bet chips toward pot center
                const dx = 50 - pos.left;
                const dy = 50 - pos.top;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                const pushX = (dx / dist) * 52;
                const pushY = (dy / dist) * 42;

                const isLocal = p.id === myId;
                const remoteScale = Math.max(0.65, 1 - (n - 3) * 0.05);
                const innerScale = isLocal ? 1 : (isAct ? 1.3 * remoteScale : remoteScale);

                return (
                    <div key={p.id} style={{
                        position: 'absolute', left: `${pos.left}%`, top: `${pos.top}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: isAct ? 30 : 10
                    }}>
                    <div style={{
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        transform: `scale(${innerScale})`,
                        transition: 'transform 150ms ease-out'
                    }}>
                        {/* Personal Chip Stack — all players, smaller */}
                        {p.stack > 0 && (
                            <div style={{position: 'absolute', right: '100%', bottom: 20, width: 14, marginRight: 6}}>
                                <ChipStackSVG amount={p.stack} maxChips={8} />
                            </div>
                        )}

                        {/* Bet Chips (Pushed to Pot) */}
                        <div style={{
                            position: 'absolute',
                            top: '50%', left: '50%',
                            transform: hasBet ? `translate(calc(-50% + ${pushX}px), calc(-50% + ${pushY}px))` : 'translate(-50%, -50%)',
                            opacity: hasBet ? 1 : 0,
                            pointerEvents: 'none',
                            transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s',
                            zIndex: 1,
                            display: 'flex', flexDirection: 'column', alignItems: 'center'
                        }}>
                            <div style={{width: 16}}>
                                <ChipStackSVG amount={betAmt} maxChips={6} />
                            </div>
                            <div style={{fontSize: 9, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 10, marginTop: 2, border: `1px solid ${G}`}}>{betAmt}</div>
                        </div>

                        {/* Hole Cards — scaled to 55% of playing-card (22×32px native) */}
                        {!p.folded && phase !== 'preflop_start' && (
                            <div style={{display: 'flex', marginBottom: -6, marginTop: -14, zIndex: 2, position: 'relative', transform: 'scale(0.55)', transformOrigin: 'center bottom'}}>
                                <HoleCard up={phase === 'showdown' || phase === 'end' || hasActed} />
                                <HoleCard up={phase === 'showdown' || phase === 'end' || hasActed} />
                            </div>
                        )}

                        {/* Player Box — local: prominent pill; remote: compact strip */}
                        {isLocal ? (
                            <div className="local-player-pill" style={{
                                width: 100,
                                background: 'linear-gradient(180deg, #6b4423 0%, #8b5a2b 45%, #5d3a1f 100%)',
                                borderTop: `2px solid ${isAct ? G : 'rgba(190,140,90,0.5)'}`,
                                borderLeft: `2px solid ${isAct ? G : 'rgba(190,140,90,0.5)'}`,
                                borderRight: `2px solid ${isAct ? G : 'rgba(190,140,90,0.5)'}`,
                                borderBottom: 'none',
                                borderRadius: '14px 14px 0 0', padding: '8px 10px', textAlign: 'center', position: 'relative',
                                boxShadow: isAct ? `0 0 0 3px ${G}, 0 0 18px ${G}66` : '0 4px 16px rgba(0,0,0,0.5)',
                                opacity: p.inactive ? 0.5 : (p.folded ? 0.7 : 1),
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}>
                                {hasBet && (
                                    <div style={{position:'absolute', bottom:'calc(100% + 4px)', left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', pointerEvents:'none', zIndex:2}}>
                                        <div style={{width:16}}><ChipStackSVG amount={betAmt} maxChips={6}/></div>
                                        <div style={{fontSize:9, fontWeight:800, color:'#fff', background:'rgba(0,0,0,0.6)', padding:'1px 4px', borderRadius:10, marginTop:2, border:`1px solid ${G}`}}>{betAmt}</div>
                                    </div>
                                )}
                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 2}}>
                                    <div style={{width: 8, height: 8, borderRadius: '50%', background: p.inactive ? '#999' : PLAYER_COLORS[i % PLAYER_COLORS.length]}}></div>
                                    <div style={{fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{p.name}{p.inactive && <span style={{fontSize: 9, fontWeight: 400, color: '#888', marginLeft: 3}}>(left)</span>}</div>
                                </div>
                                <div style={{fontSize: 16, fontWeight: 900, color: p.folded || p.inactive ? DIM : G}}>{p.inactive ? 'LEFT' : p.stack}</div>
                                {isAct && <div style={{position:'absolute', bottom:-18, background:G, color:'#000', fontSize:9, fontWeight:900, padding:'2px 8px', borderRadius:8, textTransform:'uppercase'}}>Acting...</div>}
                                {p.folded && !p.inactive && <div style={{position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%) rotate(-15deg)', background:'rgba(200,50,50,0.9)', color:'#fff', fontSize:10, fontWeight:900, padding:'2px 10px', borderRadius:4, border:'1px solid rgba(255,255,255,0.3)', pointerEvents:'none'}}>FOLDED</div>}
                                {i === sbI && <div style={{position:'absolute', left:-10, bottom:-10, background:'#42a5f5', color:'#fff', width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, border:'2px solid #1a0f0a'}}>SB</div>}
                                {i === bbI && <div style={{position:'absolute', left:-10, bottom:-10, background:'#ef5350', color:'#fff', width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, border:'2px solid #1a0f0a'}}>BB</div>}
                                {i === dealer && <div style={{position:'absolute', right:-10, bottom:-10, background:'#fff', color:'#000', width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:900, border:'2px solid #1a0f0a'}}>D</div>}
                            </div>
                        ) : (
                            <div style={{
                                background: p.folded ? 'rgba(0,0,0,0.5)' : 'rgba(12,22,16,0.88)',
                                border: `1px solid ${isAct ? G : (p.folded || p.inactive ? 'rgba(255,255,255,0.08)' : 'rgba(93,64,55,0.5)')}`,
                                borderRadius: 10, padding: '4px 7px', position: 'relative',
                                boxShadow: isAct ? `0 0 0 2px ${G}, 0 0 10px ${G}55` : 'none',
                                opacity: p.inactive ? 0.5 : (p.folded ? 0.4 : 1),
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
                            }}>
                                <div style={{width: 6, height: 6, borderRadius: '50%', background: p.inactive ? '#999' : PLAYER_COLORS[i % PLAYER_COLORS.length], flexShrink: 0}}></div>
                                <div style={{fontSize: 10, fontWeight: 700, color: p.folded ? 'rgba(255,255,255,0.45)' : '#fff', textDecoration: p.folded ? 'line-through' : 'none', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis'}}>{p.inactive ? 'LEFT' : p.name}</div>
                                {i === sbI && <div style={{fontSize: 8, fontWeight: 900, color: '#42a5f5', lineHeight: 1}}>SB</div>}
                                {i === bbI && <div style={{fontSize: 8, fontWeight: 900, color: '#ef5350', lineHeight: 1}}>BB</div>}
                                {i === dealer && <div style={{fontSize: 8, fontWeight: 900, color: '#f0c040', lineHeight: 1}}>D</div>}
                                {p.folded && !p.inactive && <div style={{fontSize: 8, fontWeight: 900, color: 'rgba(255,100,100,0.8)', lineHeight: 1}}>FOLD</div>}
                            </div>
                        )}
                    </div>
                    </div>
                );
            })}
        </div>

        {/* ── Action / Waiting strip ─────────────────────────────────────────── */}
        {isBet && actP ? (
            isMyTurn ? (
                <div style={{display:'flex', height:52, width:'100%', borderRadius:'0 0 14px 14px', overflow:'hidden', marginBottom:8}}>
                    <button onClick={toCall===0 ? doCheck : doCall} style={{flex:1, background:'#1565c0', border:'none', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', borderRadius:'0 0 0 14px'}}>
                        {toCall===0 ? 'Check' : `Call ${toCall}`}
                    </button>
                    <button onClick={()=>{if(canRaiseBtn)setRm(true);}} style={{flex:1, background:canRaiseBtn?'#b8880e':'#555', border:'none', color:'#fff', fontSize:14, fontWeight:800, cursor:canRaiseBtn?'pointer':'default', opacity:canRaiseBtn?1:0.6}}>
                        {ba}
                    </button>
                    <button onClick={doFold} style={{flex:1, background:'#8b1a1a', border:'none', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', borderRadius:'0 0 14px 0'}}>
                        Fold
                    </button>
                </div>
            ) : (
                <div style={{height:52, background:'rgba(10,5,2,0.9)', display:'flex', alignItems:'center', justifyContent:'center', color:DIM, fontSize:13, borderRadius:'0 0 14px 14px', marginBottom:8}}>
                    ⏳ Waiting for <span style={{color:G, fontWeight:700, marginLeft:4}}>{actP.name}</span>
                </div>
            )
        ) : null}

        {/* ── Raise / Bet modal (fixed overlay) ─────────────────────────────── */}
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

        <div style={{position:'relative',zIndex:50}}>{showSt&&<Card>{sortedSt.map((p,i)=><div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}><span style={{color:p.folded?DIM:"#fff"}}>{MED[i]} {p.name}{ai.includes(p.id)?" [AI]":""}</span><span style={{color:G,fontWeight:700}}>{p.stack} <span style={{color:DIM,fontWeight:400,fontSize:11}}>{scores[p.id]||0}pt</span></span></div>)}</Card>}</div>

        <Card><p style={{color:G,fontWeight:700,marginTop:0,marginBottom:6,fontSize:11}}>Action Log</p><div style={{maxHeight:60,overflowY:"auto",fontSize:12,color:DIM}}>{(log||[]).map((l,i)=><div key={i} style={{padding:"2px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>{l}</div>)}</div></Card>

        {/* ── Phase Modals ─────────────────────────────────────────────────────── */}

        {/* Pre-flop intro */}
        {phase==="preflop_start" && <PhaseModal>
            <div style={{position: 'relative', overflow: 'hidden'}}>
                <div style={{position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle at 50% 50%, rgba(240,192,64,0.08) 0%, transparent 60%)', zIndex: 0, pointerEvents: 'none'}}></div>
                <div style={{position: 'relative', zIndex: 1, textAlign: 'center'}}>
                    <div style={{display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 16}}>
                        <div style={{fontSize:44, transform: 'rotate(-10deg)', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'}}>♥️</div>
                        <div style={{fontSize:44, transform: 'rotate(10deg)', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'}}>♠️</div>
                    </div>
                    <h2 style={{margin: "0 0 6px", fontSize: 24, fontWeight: 900, background: 'linear-gradient(90deg, #f0c040 0%, #fff 50%, #f0c040 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 1}}>THE PRE-FLOP</h2>
                    <p style={{color: '#ddd', fontSize: 14, margin: "0 0 20px", fontWeight: 500}}>Cards are dealt. Action is on!</p>
                    <div style={{background: "rgba(0,0,0,0.4)", border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 16, marginBottom: 20, textAlign: "left", boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'}}>
                        <div style={{fontSize:11, color:DIM, marginBottom:14, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 800, textAlign: 'center'}}>Table Positions</div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                    <span style={{background: 'linear-gradient(135deg, #eee, #999)', color: '#000', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, boxShadow: '0 2px 5px rgba(0,0,0,0.5)'}}>D</span>
                                    <span style={{color: '#ccc', fontWeight: 600, fontSize: 14}}>Dealer</span>
                                </div>
                                <span style={{color: '#fff', fontWeight: 800, fontSize: 15}}>{players[dealer]&&players[dealer].name}</span>
                            </div>
                            <div style={{height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'}}></div>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                    <span style={{background: 'linear-gradient(135deg, #42a5f5, #1565c0)', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, boxShadow: '0 2px 5px rgba(0,0,0,0.5)'}}>SB</span>
                                    <span style={{color: '#ccc', fontWeight: 600, fontSize: 14}}>Small Blind</span>
                                </div>
                                <div style={{textAlign: 'right'}}>
                                    <div style={{color: '#fff', fontWeight: 800, fontSize: 15}}>{players[sbI]&&players[sbI].name}</div>
                                    <div style={{color: '#64b5f6', fontSize: 12, fontWeight: 700}}>{cfg.sb} chips</div>
                                </div>
                            </div>
                            <div style={{height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'}}></div>
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                    <span style={{background: 'linear-gradient(135deg, #ef5350, #c62828)', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, boxShadow: '0 2px 5px rgba(0,0,0,0.5)'}}>BB</span>
                                    <span style={{color: '#ccc', fontWeight: 600, fontSize: 14}}>Big Blind</span>
                                </div>
                                <div style={{textAlign: 'right'}}>
                                    <div style={{color: '#fff', fontWeight: 800, fontSize: 15}}>{players[bbI]&&players[bbI].name}</div>
                                    <div style={{color: '#ef5350', fontSize: 12, fontWeight: 700}}>{cfg.bb} chips</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {isDealer ? (
                        <Btn full bg="linear-gradient(180deg, #388e3c 0%, #1b5e20 100%)" onClick={()=>emitAction('reveal')} style={{padding: '14px 0', fontSize: 15, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 6px 20px rgba(27,94,32,0.6)', border: '1px solid #4caf50', borderRadius: 12}}>Start the Round</Btn>
                    ) : (
                        <div style={{padding:'12px 0',color:DIM,fontSize:14}}>
                            <div style={{fontSize:24,marginBottom:8}}>⏳</div>
                            Waiting for <span style={{color:G,fontWeight:700}}>{players[dealer]&&players[dealer].name}</span> (Dealer) to start the round...
                        </div>
                    )}
                </div>
            </div>
        </PhaseModal>}

        {/* Flop / Turn / River reveal */}
        {rvli && <PhaseModal>
            <div style={{position: 'relative', overflow: 'hidden', textAlign: 'center'}}>
                <div style={{position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle at 50% 50%, rgba(80,140,255,0.08) 0%, transparent 60%)', zIndex: 0, pointerEvents: 'none'}}></div>
                <div style={{position: 'relative', zIndex: 1}}>
                    <div style={{fontSize:52, marginBottom:16, filter: 'drop-shadow(0 4px 10px rgba(80,140,255,0.4))'}}>{rvli.i}</div>
                    <h2 style={{margin: "0 0 8px", fontSize: 26, fontWeight: 900, background: 'linear-gradient(90deg, #64b5f6 0%, #fff 50%, #64b5f6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 2}}>{rvli.t}</h2>
                    <p style={{color: '#ddd', fontSize: 15, margin: "0 0 24px", fontWeight: 500}}>{rvli.s}</p>
                    {isDealer ? (
                        <Btn full bg="linear-gradient(180deg, #1976d2 0%, #0d47a1 100%)" onClick={proceedReveal} style={{padding: '14px 0', fontSize: 15, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', boxShadow: '0 6px 20px rgba(13,71,161,0.6)', border: '1px solid #42a5f5', borderRadius: 12}}>Reveal Cards</Btn>
                    ) : (
                        <div style={{padding:'12px 0',color:DIM,fontSize:14}}>
                            <div style={{fontSize:24,marginBottom:8}}>⏳</div>
                            Waiting for <span style={{color:G,fontWeight:700}}>{players[dealer]&&players[dealer].name}</span> (Dealer) to reveal cards...
                        </div>
                    )}
                </div>
            </div>
        </PhaseModal>}

        {/* Showdown */}
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

        {/* Hand over */}
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

        {/* Session end */}
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

    </div></div>);
}
