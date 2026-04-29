const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

const startIdx = content.indexOf('{screen==="count"&&<Card>');
const endIdx = content.indexOf('</div></div>);}');

let setupCode = content.substring(startIdx, endIdx);
// Replace setScreen with setView
setupCode = setupCode.replace(/setScreen/g, "setView");
setupCode = setupCode.replace(/window\.storage\.delete\(SKEY\)\.catch\(\(\)=>{}\);/g, "");

const header = `import React, { useState } from 'react';
import { Btn, Card, Fld, Ov, DB, SR, SS, G, SV, BR, DIM } from './UI';

export default function SetupFlow({ emitStart }) {
    const [view, setView] = useState("count");
    const [numP, setNumP] = useState("");
    const [equalStack, setEqualStack] = useState(true);
    const [roster, setRoster] = useState([]);
    const [globalStack, setGlobalStack] = useState("");
    const [sbVal, setSbVal] = useState("");
    const [bbVal, setBbVal] = useState("");
    const [sessVal, setSessVal] = useState("");
    
    const tot = parseInt(numP)||0;

    const doStart = () => {
        const sb=Number(sbVal),bb=Number(bbVal),sess=Number(sessVal);
        if(!sb||!bb||!sess||bb<=sb){alert("BB > SB, sessions > 0");return;}
        const c={sb,bb,sessions:sess};
        const pls=roster.map((p,i)=>({id:i,name:p.name,stack:p.stack,folded:false}));
        emitStart({ cfg: c, players: pls });
    };

    return <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",padding:20}}>
        <div style={{maxWidth: 460, width: "100%"}}>
`;

// we need to fix the onclick of the final start button to use doStart()
setupCode = setupCode.replace(/onClick=\{.*?\}\>🎲 Start Game\<\/Btn\>/s, 'onClick={doStart}>🎲 Start Game</Btn>');

const footer = `\n</div></div>;\n}`;

fs.writeFileSync('client/src/components/SetupFlow.jsx', header + setupCode + footer);
