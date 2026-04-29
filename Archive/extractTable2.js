const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

let jsxStart = content.indexOf('const sortedSt=');
let jsxEnd = content.indexOf('</Card>}</Card>}</div></div>);', jsxStart) + 23;

if (jsxEnd < 23 || jsxEnd > content.length) {
    jsxEnd = content.lastIndexOf('</div></div>);') + 14;
}

let jsxContent = content.substring(jsxStart, jsxEnd);
jsxContent = jsxContent.replace(/setPhase\("preflop"\)/g, "emitAction('reveal')");

const header = `import React, { useState } from 'react';
import { Btn, Card, Fld, Ov, DB, SR, SS, HoleCard, CommCard, getCommunityCards, AnimatedPot, AnimatedSidePot, CDlg, SSDlg, HRDlg, StatsMod, ChipStackSVG, PLAYER_COLORS, G, SV, BR, DIM, MED, NP, PL, RVLI, buildPots } from './UI';

export default function GameTable({ gameState, emitAction, socket }) {
    const { phase, players, cfg, pot, cp, dealer, queue, hc, ai, rBets, curBet, lr, lfb, scores, history, undoStack, pi, wi, hn, sn, ba, cpd: backendCpd } = gameState;
    
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
    
    const n = players ? players.length : 0;
    const actI = queue ? queue[0] : null;
    const isBet = phase==="preflop"||phase==="flop"||phase==="turn"||phase==="river";
    const actP = isBet && actI !== undefined && actI !== null ? players[actI] : null;
    const toCall = isBet && actP ? curBet - (rBets[actI]||0) : 0;
    const sbI = (dealer+1)%n;
    const bbI = (dealer+2)%n;
    const rvli = RVLI[phase];
    const cpd = backendCpd || (phase==="showdown" && cp ? cp[pi] : null);
    
    // Handlers
    const proceedReveal = () => emitAction('reveal');
    const doFold = () => emitAction('fold');
    const doCheck = () => emitAction('check');
    const doCall = () => emitAction('call');
    const doRaise = () => { emitAction('raise', ra); setRm(false); setRa(""); setMc(false); };
    const doAllIn = () => emitAction('allin');
    
    const doConfirm = (d) => {
        setCdlg(null);
        if(d.type==="winner") { setHrd({wi:d.id, name:d.name, amt:d.amt, label:d.label}); }
        else if(d.type==="split") { emitAction('split_win', null, d.eligible, d.amt); }
    };
    const finalWin = (w, hr) => { emitAction('award_win', null, {wid: w, hr}); };
    const nextSession = () => emitAction('next_session');
    
    const handleHome = () => socket.emit('leave_room');
    const handleUndo = () => emitAction('undo');

    const gameOver = phase === "end" && sn >= cfg.sessions;
    const sei = phase === "session_end" ? gameState.sei : null;
    
    if(gameOver){
        const gs=players.slice().sort((a,b)=>(scores[b.id]||0)-(scores[a.id]||0)),li=gs.length-1;
        if(goView==="scores")return(<div style={{padding:20}}><div style={{maxWidth:460,margin:"0 auto"}}><div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 0 10px"}}><button onClick={()=>setGoView("main")} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button><h2 style={{color:G,margin:0}}>Final Scoreboard</h2></div><Card>{gs.map((p,i)=>{const clr=i===0?G:i===1?SV:i===2?BR:i===li?"#ff3333":"#fff";return(<div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 4px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span style={{color:clr,fontWeight:i===0?800:400}}>{i===0?"👑 ":""}{MED[i]} {p.name}</span><span style={{color:clr,fontWeight:700}}>{scores[p.id]||0} pts</span></div>);})}</Card>{showStats&&<StatsMod hist={history} pls={players} scores={scores} onClose={()=>setShowStats(false)}/>}</div></div>);
        return(<div style={{padding:20}}>
          <style>{\`.drip{color:#ff2222;animation:dr 2s infinite;font-weight:800}@keyframes dr{0%,100%{text-shadow:0 0 0 #f00}50%{text-shadow:0 3px 10px #f00,0 8px 5px #800}}\`}</style>
          <div style={{maxWidth:460,margin:"0 auto"}}>
            <div style={{textAlign:"center",padding:"16px 0 10px"}}><div style={{fontSize:44}}>🏁</div><h1 style={{color:G,fontSize:24,margin:"5px 0 2px"}}>GAME OVER</h1><p style={{color:DIM,fontSize:13}}>All {cfg.sessions} sessions complete!</p></div>
            <Card>{gs.map((p,i)=>{const isW=i===0,isL=i===li,clr=isW?G:i===1?SV:i===2?BR:isL?"#ff3333":"#fff";return(<div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 6px",borderBottom:"1px solid rgba(255,255,255,0.06)"}}><span style={{color:clr,fontWeight:isW?800:400,fontSize:isW?17:14}}>{isW?"👑 ":""}{isL?<span className="drip">{p.name} ☠️</span>:<span>{MED[i]} {p.name}</span>}</span><span style={{color:clr,fontWeight:700}}>{scores[p.id]||0} pts</span></div>);})}</Card>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <Btn full bg="#333" onClick={()=>setGoView("scores")}>📋 Scoreboard</Btn>
              <Btn full bg="#333" onClick={()=>setShowStats(true)}>📊 Statistics</Btn>
            </div>
            {showStats&&<StatsMod hist={history} pls={players} scores={scores} onClose={()=>setShowStats(false)}/>}
          </div>
        </div>);
      }

      if(phase==="session_end"&&sei)return(<div style={{padding:20}}><div style={{maxWidth:460,margin:"0 auto"}}>
        <div style={{textAlign:"center",padding:"14px 0 10px"}}><div style={{fontSize:40}}>📊</div><h2 style={{color:G,margin:"5px 0 2px"}}>SESSION {sn} OVER</h2><p style={{color:DIM,margin:0,fontSize:13}}>{sei.rankings[sei.rankings.length-1].name} went bankrupt!</p></div>
        <Card><p style={{color:G,fontWeight:700,marginTop:0,marginBottom:10}}>Session Rankings</p>{sei.rankings.map((p,i)=>{const pt=sei.pts[p.id]||0;return(<div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:10,marginBottom:4,background:i===0?"rgba(240,192,64,0.1)":"rgba(255,255,255,0.04)",border:i===0?"1px solid rgba(240,192,64,0.3)":"1px solid transparent"}}><span>{MED[i]} {p.name}</span><div><span style={{color:G,fontWeight:700}}>+{pt} pts</span><span style={{color:DIM,fontSize:12,marginLeft:8}}>({p.stack} chips)</span></div></div>);})}</Card>
        <Card><p style={{color:G,fontWeight:700,marginTop:0,marginBottom:8}}>Cumulative Scores</p>{players.slice().sort((a,b)=>(sei.ns[b.id]||0)-(sei.ns[a.id]||0)).map((p,i)=><div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}><span>{MED[i]} {p.name}</span><span style={{color:G,fontWeight:700}}>{sei.ns[p.id]||0} pts</span></div>)}</Card>
        <div style={{display:"flex",gap:8}}>{sn<cfg.sessions?<Btn full onClick={nextSession}>Next Session →</Btn>:null}<Btn bg="#333" onClick={()=>setShowStats(true)}>📊</Btn></div>
        {showStats&&<StatsMod hist={history} pls={players} scores={sei.ns} onClose={()=>setShowStats(false)}/>}
      </div></div>);

`;

fs.writeFileSync('client/src/components/GameTable.jsx', header + "\n    " + jsxContent.replace('const sortedSt=', '// const sortedSt=') + "\n}\n");
