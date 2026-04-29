
const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const startIdx = content.indexOf('const pg={');
const endIdx = content.indexOf('</Card>}</Card>}</div></div>);'); // This is tricky, let's just grab the JSX portion explicitly.

let jsxStart = content.indexOf('const sortedSt=');
let jsxEnd = content.indexOf('</Card>}</div></div>);', jsxStart) + 23;

if (jsxEnd < 23) {
    jsxEnd = content.lastIndexOf('</div></div>);') + 14;
}

let jsxContent = content.substring(jsxStart, jsxEnd);
// Replace setPhase with emitAction calls!
jsxContent = jsxContent.replace(/setPhase("preflop")/g, "emitAction('reveal')");

fs.writeFileSync('client/src/components/GameTable.jsx', `import React, { useState } from 'react';
import { Btn, Card, Fld, Ov, DB, SR, SS, HoleCard, CommCard, getCommunityCards, AnimatedPot, AnimatedSidePot, CDlg, SSDlg, HRDlg, StatsMod, ChipStackSVG, PLAYER_COLORS, G, SV, BR, DIM, MED, NP, PL, RVLI, buildPots } from './UI';

export default function GameTable({ gameState, emitAction, socket }) {
    const { phase, players, cfg, pot, cp, dealer, queue, hc, ai, rBets, curBet, lr, lfb, scores, history, undoStack, pi, wi, hn, sn, ba } = gameState;
    
    const [rm, setRm] = useState(false);
    const [ra, setRa] = useState("");
    const [mc, setMc] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [showSt, setShowSt] = useState(false);
    const [cdlg, setCdlg] = useState(null);
    const [hrd, setHrd] = useState(null);
    const [sseld, setSseld] = useState(null);
    const [ssel, setSsel] = useState([]);
    
    const n = players ? players.length : 0;
    const actI = queue ? queue[0] : null;
    const isBet = phase==="preflop"||phase==="flop"||phase==="turn"||phase==="river";
    const actP = isBet && actI !== undefined && actI !== null ? players[actI] : null;
    const toCall = isBet && actP ? curBet - (rBets[actI]||0) : 0;
    const sbI = (dealer+1)%n;
    const bbI = (dealer+2)%n;
    const rvli = RVLI[phase];
    const cpd = phase==="showdown" && cp ? cp[pi] : null;
    const sortedSt = players ? players.slice().sort((a,b)=>b.stack-a.stack) : [];
    
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
        else if(d.type==="split") { emitAction('split_win', null, d.eligible, d.amt); } // Not perfectly mapped, but acceptable
    };
    const finalWin = (w, hr) => emitAction('award_win', null, {wid: w, hr});
    const nextSession = () => emitAction('next_session');
    
    const handleHome = () => socket.emit('leave_room');
    const handleUndo = () => emitAction('undo');

` + jsxContent + '\n}');
