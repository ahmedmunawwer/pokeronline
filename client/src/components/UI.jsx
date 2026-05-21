import React, { useState, useEffect, useRef } from 'react';
const TIERS = [["High Card","One Pair","Two Pair","Three of a Kind"],["Straight","Flush","Full House"],["Four of a Kind","Straight Flush","Royal Flush"]];
const RV = {"High Card":1,"One Pair":2,"Two Pair":3,"Three of a Kind":4,"Straight":5,"Flush":6,"Full House":7,"Four of a Kind":8,"Straight Flush":9,"Royal Flush":10};
export const G="#f0c040", SV="#aab4be", BR="#cd7f32", DIM="rgba(255,255,255,0.4)";
export const PLAYER_COLORS = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#f15bb5", "#00f5d4", "#fca311", "#9b5de5", "#00bbf9"];
export const MED=["🥇","🥈","🥉","4th","5th","6th","7th","8th","9th","10th"];
export const NP={preflop:"flop_reveal",flop:"turn_reveal",turn:"river_reveal",river:"showdown"};
export const PL={preflop_start:"PRE-FLOP",preflop:"PRE-FLOP",flop_reveal:"FLOP",flop:"FLOP",turn_reveal:"TURN",turn:"TURN",river_reveal:"RIVER",river:"RIVER",showdown:"SHOWDOWN",end:"HAND OVER",session_end:"SESSION OVER"};
export const RVLI={flop_reveal:{t:"THE FLOP",s:"Reveal 3 community cards",i:"🃏 🃏 🃏"},turn_reveal:{t:"THE TURN",s:"Reveal the 4th card",i:"🃏"},river_reveal:{t:"THE RIVER",s:"Reveal the 5th card",i:"🃏"}};

export const Btn=({onClick,bg,children,full,sm,dis,style})=><button onClick={dis?null:onClick} style={Object.assign({background:bg||"#2a8a46",border:"none",borderRadius:10,color:"#fff",padding:sm?"7px 10px":"11px 15px",fontSize:sm?12:14,fontWeight:700,cursor:dis?"default":"pointer",opacity:dis?0.5:1,width:full?"100%":null,boxSizing:"border-box"},style||{})}>{children}</button>;
export const Card=({children,sx})=><div style={Object.assign({background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:16,marginBottom:12},sx||{})}>{children}</div>;
export const Fld=({lbl,val,ch,ph,type,mb})=><div style={{marginBottom:mb||8}}>{lbl&&<div style={{color:DIM,fontSize:13,marginBottom:4}}>{lbl}</div>}<input type={type||"text"} value={val} onChange={ch} placeholder={ph} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:9,color:"#fff",padding:"10px 13px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"}}/></div>;
export const Ov=({children})=><div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16,overflowY:"auto"}}><div style={{maxWidth:370,width:"100%"}}>{children}</div></div>;
export const DB=({children,sx})=><div style={Object.assign({background:"#0d2518",border:"1px solid rgba(240,192,64,0.4)",borderRadius:20,padding:22,boxSizing:"border-box"},sx||{})}>{children}</div>;
export const SR=({l,v,hi})=><div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",fontSize:13}}><span style={{color:DIM,marginRight:6,flexShrink:0}}>{l}</span><span style={{color:hi?G:"#fff",fontWeight:hi?700:400,textAlign:"right"}}>{v}</span></div>;
export const SS=({title,children})=><div style={{marginBottom:12}}><div style={{color:G,fontWeight:700,fontSize:12,marginBottom:5,borderBottom:"1px solid rgba(240,192,64,0.2)",paddingBottom:3}}>{title}</div>{children}</div>;
const HoleCard = ({up}) => (
            <div className="playing-card">
                <div className={`card-inner ${up ? 'flipped' : ''}`}>
                    <div className="card-back"></div>
                    <div className="card-front"><span style={{color: '#d32f2f', fontSize: 16}}>♥</span></div>
                </div>
            </div>
        );

        const CommCard = ({up, rank, suit, red}) => {
            const clr = red ? '#d32f2f' : '#111';
            return (
                <div className="community-card">
                    <div className={`card-inner ${up ? 'flipped' : ''}`}>
                        <div className="card-back"></div>
                        <div className="card-front" style={{position: 'relative'}}>
                            <div style={{position:'absolute',top:2,left:3,fontSize:9,fontWeight:800,color:clr,lineHeight:1.1,textAlign:'center'}}>
                                <div>{rank}</div>
                                <div>{suit}</div>
                            </div>
                            <span style={{fontSize: 20, color: clr}}>{suit}</span>
                            <div style={{position:'absolute',bottom:2,right:3,fontSize:9,fontWeight:800,color:clr,lineHeight:1.1,textAlign:'center',transform:'rotate(180deg)'}}>
                                <div>{rank}</div>
                                <div>{suit}</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        };

        const COMM_CARDS = [
            {rank:'J', suit:'♥', red:true},
            {rank:'8', suit:'♥', red:true},
            {rank:'3', suit:'♥', red:true},
            {rank:'K', suit:'♣', red:false},
            {rank:'A', suit:'♦', red:true},
        ];

        function getCommunityCards(phase) {
            const mk = (n, upCount) => COMM_CARDS.slice(0, n).map((c, i) => ({...c, up: i < upCount}));
            if (phase === 'preflop_start' || phase === 'preflop') return [];
            if (phase === 'flop_reveal') return mk(3, 0);
            if (phase === 'flop') return mk(3, 3);
            if (phase === 'turn_reveal') return mk(4, 3);
            if (phase === 'turn') return mk(4, 4);
            if (phase === 'river_reveal') return mk(5, 4);
            if (phase === 'river' || phase === 'showdown' || phase === 'end' || phase === 'session_end') return mk(5, 5);
            return [];
        }

        const ChipStackSVG = ({ amount, maxChips = 10 }) => {
            const [bump, setBump] = useState(false);
            useEffect(() => {
                if(amount > 0) {
                    setBump(true);
                    const t = setTimeout(() => setBump(false), 200);
                    return () => clearTimeout(t);
                }
            }, [amount]);

            const chipCount = amount === 0 ? 0 : Math.min(maxChips, Math.max(1, Math.ceil(amount / (amount >= 1000 ? 500 : 50))));
            if (chipCount === 0) return null;
            const colors = ['#d32f2f', '#1976d2', '#388e3c', '#fbc02d', '#8e24aa'];
            const height = 15 + chipCount * 5;
            
            return (
                <div style={{ 
                    width: '100%', 
                    transform: bump ? 'translateY(-4px)' : 'none', 
                    transition: 'transform 0.15s' 
                }}>
                    <svg width="100%" height="100%" viewBox={`0 0 40 ${height}`} style={{overflow: 'visible', filter: 'drop-shadow(0 4px 5px rgba(0,0,0,0.6))'}}>
                        {Array.from({length: chipCount}).map((_, i) => {
                            const y = (chipCount - 1 - i) * 5;
                            const color = colors[(i + (amount%3)) % colors.length];
                            return (
                                <g key={i} transform={`translate(0, ${y})`}>
                                    <path d="M 2 10 A 18 7 0 0 0 38 10 L 38 15 A 18 7 0 0 1 2 15 Z" fill={color} stroke="#000" strokeWidth="1" />
                                    <path d="M 2 10 A 18 7 0 0 0 38 10 L 38 15 A 18 7 0 0 1 2 15 Z" fill="#000" opacity="0.3" />
                                    <ellipse cx="20" cy="10" rx="18" ry="7" fill={color} stroke="#000" strokeWidth="1"/>
                                    <ellipse cx="20" cy="10" rx="13" ry="5" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeDasharray="4,2"/>
                                    <ellipse cx="20" cy="10" rx="6" ry="2" fill="rgba(255,255,255,0.3)"/>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            );
        };

        const AnimatedPot = ({ pot, eligible, players }) => {
            const [bump, setBump] = useState(false);
            useEffect(() => {
                if(pot > 0) {
                    setBump(true);
                    const t = setTimeout(() => setBump(false), 200);
                    return () => clearTimeout(t);
                }
            }, [pot]);

            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 5
                }}>
                    {pot > 0 ? (
                        <div style={{ width: 44, marginBottom: 2 }}>
                            <ChipStackSVG amount={pot} maxChips={12} />
                        </div>
                    ) : (
                        <div style={{height: 15}}></div>
                    )}
                    
                    <div style={{
                        background: 'linear-gradient(180deg, #fff 0%, #f0c040 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontSize: 28, fontWeight: 900,
                        transform: bump ? 'scale(1.2)' : 'scale(1)',
                        transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        textShadow: '0 0 15px rgba(240,192,64,0.6)',
                        lineHeight: 1
                    }}>
                        ${pot}
                    </div>
                    <div style={{fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2}}>Main Pot</div>
                    <div style={{display:'flex', gap:4, justifyContent:'center', marginTop: 6, flexWrap: 'wrap', maxWidth: 80}}>
                        {eligible && players && eligible.map(ep => {
                            const pi = players.findIndex(p=>p.id===ep.id);
                            if(pi === -1) return null;
                            return <div key={ep.id} style={{width: 8, height: 8, borderRadius: '50%', background: PLAYER_COLORS[pi % PLAYER_COLORS.length], boxShadow: '0 0 4px rgba(0,0,0,0.5)'}} title={ep.name}></div>
                        })}
                    </div>
                </div>
            );
        };

        const AnimatedSidePot = ({ potAmount, label, eligible, players }) => {
            const [bump, setBump] = useState(false);
            useEffect(() => {
                if(potAmount > 0) {
                    setBump(true);
                    const t = setTimeout(() => setBump(false), 200);
                    return () => clearTimeout(t);
                }
            }, [potAmount]);

            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 5,
                    background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: '4px 8px', border: '1px solid rgba(160,100,240,0.3)',
                    transform: bump ? 'scale(1.1)' : 'scale(1)',
                    transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}>
                    <div style={{ width: 24, marginBottom: 2 }}>
                        <ChipStackSVG amount={potAmount} maxChips={5} />
                    </div>
                    <div style={{
                        color: '#c8a0ff', fontSize: 16, fontWeight: 800, textShadow: '0 0 8px rgba(160,100,240,0.5)'
                    }}>
                        ${potAmount}
                    </div>
                    <div style={{fontSize: 8, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, textTransform: 'uppercase'}}>{label}</div>
                    <div style={{display:'flex', gap:3, justifyContent:'center', marginTop: 4, flexWrap: 'wrap', maxWidth: 60}}>
                        {eligible && players && eligible.map(ep => {
                            const pi = players.findIndex(p=>p.id===ep.id);
                            if(pi === -1) return null;
                            return <div key={ep.id} style={{width: 6, height: 6, borderRadius: '50%', background: PLAYER_COLORS[pi % PLAYER_COLORS.length], boxShadow: '0 0 3px rgba(0,0,0,0.8)'}} title={ep.name}></div>
                        })}
                    </div>
                </div>
            );
        };

        function buildPots(pls,cont,aiSet){
          const pIds=Object.keys(cont);
          if(!pIds.length)return[];
          const totalPot=pIds.reduce((s,id)=>s+(cont[id]||0),0);
          if(totalPot===0)return[];
          const activePlayers=pls.filter(p=>!p.folded);
          if(!aiSet||!aiSet.length)return[{amount:totalPot,eligible:activePlayers,label:"Main Pot"}];
          const aiContribs=[...new Set(aiSet.filter(id=>cont[id]>0).map(id=>cont[id]))].sort((a,b)=>a-b);
          if(!aiContribs.length)return[{amount:totalPot,eligible:activePlayers,label:"Main Pot"}];
          const pots=[];let prevLevel=0;let k=0;
          for(const level of aiContribs){const cap=level-prevLevel;if(cap<=0){k++;continue;}let potAmt=0;const eligible=[];for(const id of pIds){const c=cont[id]||0;potAmt+=Math.min(c,level)-Math.min(c,prevLevel);const pl=pls.find(p=>p.id===id);if(pl&&!pl.folded&&(c>=level||(prevLevel===0&&k===0)))eligible.push(pl);}if(potAmt>0)pots.push({amount:potAmt,eligible,label:"Pot"});prevLevel=level;k++;}
          const highAI=aiContribs[aiContribs.length-1];let rem=0;const remE=[];for(const id of pIds){const c=cont[id]||0;rem+=c-Math.min(c,highAI);const pl=pls.find(p=>p.id===id);if(pl&&!pl.folded&&c>=highAI)remE.push(pl);}
          if(rem>0&&remE.length>0)pots.push({amount:rem,eligible:remE,label:"Pot"});
          if(!pots.length)return[];if(pots.length===1){pots[0].label="Main Pot";return pots;}
          pots[0].label="Main Pot";for(let i=1;i<pots.length;i++)pots[i].label="Side Pot "+i;
          return pots;
        }
        function calcSPts(sorted){const n=sorted.length,pts={};sorted.forEach((p,i)=>{pts[p.id]=i===0?n:Math.max(0,n-1-i);});return pts;}
        function findP(arr,id){return arr.find(p=>p.id===id)||null;}
        function computeStats(hist,pls){
          if(!hist||!hist.length)return null;
          const ps={};pls.forEach(p=>{ps[p.id]={id:p.id,name:p.name,won:0,lost:0,folds:0,checks:0,raises:0,bet:0,bw:0,bl:0,bs:0,hr:[],hp:0};});
          const sc={};
          hist.forEach(h=>{
            sc[h.sn]=(sc[h.sn]||0)+1;
            pls.forEach(p=>{const st=ps[p.id];if(!st)return;st.hp++;const net=h.net[p.id]||0;if(p.id===h.wid){st.won++;if(net>st.bw)st.bw=net;if(h.hr)st.hr.push(h.hr);}else{st.lost++;if(Math.abs(net)>st.bl)st.bl=Math.abs(net);}});
            (h.acts||[]).forEach(a=>{const st=ps[a.id];if(!st)return;if(a.type==="fold")st.folds++;else if(a.type==="check")st.checks++;else if(a.type==="raise"||a.type==="allin"){st.raises++;st.bet+=a.amt;if(a.amt>st.bs)st.bs=a.amt;}else if(a.type==="call")st.bet+=a.amt;});
          });
          const maxH=Math.max(...Object.values(sc),0),pArr=Object.values(ps);
          const topAll=fn=>{const mx=Math.max(...pArr.map(p=>fn(p)));return pArr.filter(p=>fn(p)===mx);};
          const top=fn=>topAll(fn)[0]||null;
          const hf={};pArr.forEach(p=>{const f={};p.hr.forEach(r=>{f[r]=(f[r]||0)+1;});hf[p.id]=Object.entries(f).sort((a,b)=>b[1]-a[1])[0]||null;});
          return{pArr,maxH,top,topAll,hf,sessionsPlayed:Object.keys(sc).length,handsPerSession:sc,bestH:hist.filter(h=>h.hr).sort((a,b)=>(RV[b.hr]||0)-(RV[a.hr]||0))[0]||null,consistent:pArr.filter(p=>p.hp>0).sort((a,b)=>(b.won/b.hp)-(a.won/a.hp))[0]||null,inconsistent:pArr.filter(p=>p.hp>0).sort((a,b)=>(a.won/a.hp)-(b.won/b.hp))[0]||null};
        }
        function StatsMod({hist,pls,scores,onClose}){
          const st=computeStats(hist,pls);
          const actN=pls.filter(p=>!p.inactive).length;
          const fmtT=(fn,vFn,skipZero)=>{if(!st)return"—";const tied=st.topAll(fn);if(!tied.length)return"—";const val=fn(tied[0]);if(skipZero&&val===0)return"—";const names=tied.length>=actN&&actN>0?"Everyone":tied.map(p=>p.name).join(" & ");return names+" ("+(vFn?vFn(val):val)+")";};
          const lowBet=(()=>{if(!st)return"—";const b=st.pArr.filter(p=>p.bet>0);if(!b.length)return"—";const mn=Math.min(...b.map(p=>p.bet));const tied=b.filter(p=>p.bet===mn);return(tied.length>=actN&&actN>0?"Everyone":tied.map(p=>p.name).join(" & "))+" ("+mn+")";})();
          const hpsStr=st?Object.entries(st.handsPerSession).sort((a,b)=>Number(a[0])-Number(b[0])).map(e=>e[1]).join(" / "):"—";
          return(<Ov><DB><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><span style={{color:G,fontWeight:800,fontSize:16}}>📊 Statistics</span><Btn sm bg="#333" onClick={onClose}>✕</Btn></div>
          <div style={{maxHeight:"72vh",overflowY:"auto"}}>
          {!st?<p style={{color:DIM,fontSize:13}}>No hands yet.</p>:<div>
            <SS title="📋 Overview"><SR l="Sessions played" v={String(st.sessionsPlayed)} hi/><SR l="Hands per session" v={hpsStr}/></SS>
            <SS title="🏆 Performance"><SR l="Most won" v={fmtT(p=>p.won,v=>v)} hi/><SR l="Most lost" v={fmtT(p=>p.lost,v=>v)}/><SR l="Most consistent" v={st.consistent?st.consistent.name:"—"} hi/><SR l="Most inconsistent" v={st.inconsistent?st.inconsistent.name:"—"}/><SR l="Max hands/session" v={String(st.maxH)}/></SS>
            <SS title="💰 Money"><SR l="Biggest single win" v={fmtT(p=>p.bw,v=>"+"+v,true)} hi/><SR l="Biggest single loss" v={fmtT(p=>p.bl,v=>"-"+v,true)}/><SR l="Highest total bets" v={fmtT(p=>p.bet,v=>v)} hi/><SR l="Lowest total bets" v={lowBet}/><SR l="Biggest single bet" v={fmtT(p=>p.bs,v=>v)}/></SS>
            <SS title="🎲 Actions"><SR l="Most raises" v={fmtT(p=>p.raises,v=>v)} hi/><SR l="Most checks" v={fmtT(p=>p.checks,v=>v)}/><SR l="Most folds" v={fmtT(p=>p.folds,v=>v)}/></SS>
            <SS title="🃏 Best Hand Ever"><SR l="Hand" v={st.bestH?st.bestH.wname+": "+st.bestH.hr:"None"} hi/></SS>
            <SS title="🎯 Fav Winning Hand">{st.pArr.map(p=><SR key={p.id} l={p.name} v={st.hf[p.id]?st.hf[p.id][0]+" ×"+st.hf[p.id][1]:"—"}/>)}</SS>
            <SS title="🏅 Scores">{pls.slice().sort((a,b)=>(scores[b.id]||0)-(scores[a.id]||0)).map((p,i)=><SR key={p.id} l={MED[i]+" "+p.name} v={(scores[p.id]||0)+" pts"} hi={i===0}/>)}</SS>
          </div>}
          </div></DB></Ov>);
        }
        function CDlg({d,onClose,onConfirm}){return(<Ov><DB><div style={{textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:8}}>{d.type==="winner"?"🏆":"🤝"}</div>
          <p style={{color:G,fontWeight:800,fontSize:18,margin:"0 0 4px"}}>{d.type==="winner"?d.name+" Wins!":"Split Pot?"}</p>
          <p style={{color:DIM,fontSize:13,margin:"0 0 4px"}}>{d.label}</p>
          <p style={{color:G,fontSize:22,fontWeight:800,margin:"0 0 14px"}}>{d.amt} chips</p>
          {d.names&&<p style={{color:DIM,fontSize:12,margin:"-8px 0 12px"}}>{d.names}</p>}
          <div style={{display:"flex",gap:10}}><Btn full bg="rgba(255,255,255,0.1)" onClick={onClose}>Cancel</Btn><Btn full bg="#1a7a40" onClick={()=>onConfirm(d)}>Confirm ✓</Btn></div>
        </div></DB></Ov>);}
        function HRDlg({d,onSelect,setTier,onSkip}){return(<Ov><DB>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            {d.tier>0&&<button onClick={()=>setTier(d.tier-1)} style={{background:"none",border:"none",color:G,fontSize:22,cursor:"pointer",padding:0}}>←</button>}
            <span style={{color:G,fontWeight:800,fontSize:15}}>What hand did they have?</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {TIERS[d.tier].map(h=><button key={h} onClick={()=>onSelect(h)} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,color:"#fff",padding:"10px 14px",fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left"}}>{h}</button>)}
            {d.tier<2&&<button onClick={()=>setTier(d.tier+1)} style={{background:"rgba(160,100,240,0.15)",border:"1px solid rgba(160,100,240,0.3)",borderRadius:10,color:"#c8a0ff",padding:"10px 14px",fontSize:14,fontWeight:600,cursor:"pointer",textAlign:"left"}}>Higher Ranks →</button>}
            <button onClick={onSkip} style={{background:"none",border:"none",color:DIM,fontSize:12,cursor:"pointer",padding:"6px 0"}}>Skip / Unknown</button>
          </div>
        </DB></Ov>);}
        function SSDlg({d,sel,setSel,onClose,onSplit}){return(<Ov><DB>
          <p style={{color:G,fontWeight:800,marginTop:0}}>Select Players to Split</p>
          <p style={{color:DIM,fontSize:13,margin:"0 0 10px"}}>{d.label}: {d.amt} chips</p>
          {d.eligible.map(p=>{const s=sel.includes(p.id);return(<div key={p.id} onClick={()=>setSel(s?sel.filter(id=>id!==p.id):[...sel,p.id])} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,marginBottom:5,background:s?"rgba(240,192,64,0.15)":"rgba(255,255,255,0.05)",border:s?"1px solid rgba(240,192,64,0.4)":"1px solid transparent",cursor:"pointer"}}>
            <span style={{fontSize:18}}>{s?"☑":"☐"}</span><span style={{color:s?G:"#fff",fontWeight:s?700:400}}>{p.name}</span><span style={{marginLeft:"auto",color:DIM,fontSize:12}}>{p.stack}</span>
          </div>);})}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <Btn full bg="rgba(255,255,255,0.1)" onClick={onClose}>Cancel</Btn>
            <Btn full bg={sel.length>=2?"#1a7a40":"#444"} dis={sel.length<2} onClick={()=>onSplit(d.eligible.filter(p=>sel.includes(p.id)),d.amt,d.label)}>Split ({sel.length} sel.)</Btn>
          </div>
        </DB></Ov>);}

        
const HANDS=[
    {name:"High Card",       hint:"The single highest card in your hand",         detail:"The lowest possible hand. It contains no pairs, no straight, and no flush. The hand's value is derived entirely from the highest single card in the 5-card combination.\n\nExamples:\n• Ace, Queen, 9, 6, and 3 (Mixed suits)\n• King, Jack, 8, 5, and 2 (Mixed suits)\n• Jack, 10, 7, 4, and 3 (Mixed suits)\n\nTie-breaker: The player with the absolute highest single card wins. If the highest cards match, compare the second-highest card, then the third, fourth, and fifth. If all five cards match exactly in rank, the pot is split.",                                                                                            bg:"rgba(245,245,245,0.10)",border:"rgba(245,245,245,0.40)",clr:"rgba(240,240,240,0.95)",dim:"rgba(200,200,200,0.70)"},
    {name:"One Pair",        hint:"Two cards of the same rank",                   detail:"A hand containing exactly two cards of the same rank, accompanied by three unrelated side cards.\n\nExamples:\n• Two Kings, a Jack, an 8, and a 4\n• Two 10s, an Ace, a 7, and a 2\n• Two 4s, a Queen, a 9, and a 5\n\nTie-breaker: The player with the highest-ranking pair wins. If players have the exact same pair, the tie is broken by comparing their highest unrelated side card, then the second highest, and finally the third.",                                                                                                                           bg:"rgba(252,244,218,0.11)",border:"rgba(252,240,190,0.42)",clr:"rgba(252,244,218,0.95)",dim:"rgba(220,210,170,0.70)"},
    {name:"Two Pair",        hint:"Two different pairs",                          detail:"A hand containing two separate pairs of different ranks, plus one unrelated side card.\n\nExamples:\n• Two Aces, Two Kings, and a 5\n• Two Jacks, Two 3s, and a Queen\n• Two 9s, Two 7s, and an Ace\n\nTie-breaker: First, compare the highest-ranking pair. The highest top pair wins (e.g., Aces and 2s beats Kings and Queens). If the top pairs match, compare the second pair. If both pairs match exactly, the player with the highest 5th card (the kicker) wins.",                                                                             bg:"rgba(252,236,168,0.12)",border:"rgba(252,228,138,0.45)",clr:"rgba(252,238,190,0.95)",dim:"rgba(230,216,150,0.70)"},
    {name:"Three of a Kind", hint:"Three cards of the same rank",                 detail:"A hand containing exactly three cards of identical rank, accompanied by two unrelated side cards.\n\nExamples:\n• Three Queens, a 7, and a 2\n• Three 8s, a King, and a 4\n• Three Aces, a Jack, and a 9\n\nTie-breaker: The player with the highest-ranking Three of a Kind wins. If players share the same Three of a Kind (via the board), the tie is broken by comparing their highest side card (kicker), and then the second side card if necessary.",                                                                                                                                                          bg:"rgba(248,220,100,0.13)",border:"rgba(248,210,78,0.48)", clr:"#f0c040",              dim:"rgba(220,185,60,0.80)"},
    {name:"Straight",        hint:"Five cards in sequence",                       detail:"Five cards in consecutive numerical sequence, but consisting of mixed suits. The Ace can be used as the highest card (above a King) or the lowest card (below a 2), but it cannot wrap around.\n\nExamples:\n• 8, 9, 10, Jack, and Queen (Mixed suits)\n• Ace, 2, 3, 4, and 5 (Mixed suits)\n• 4, 5, 6, 7, and 8 (Mixed suits)\n\nTie-breaker: The player with the highest card at the top of their straight sequence wins. For example, a Jack-high straight beats a 10-high straight. If both players have the same highest card, the pot is split.",                                                                     bg:"rgba(244,204,72,0.14)", border:"rgba(244,196,58,0.50)",clr:"#f0c040",              dim:"rgba(210,175,50,0.80)"},
    {name:"Flush",           hint:"Five cards of the same suit",                  detail:"Any five cards that all share the exact same suit, regardless of their numerical sequence.\n\nExamples:\n• Ace, Jack, 8, 4, and 2 of Spades\n• King, Queen, 9, 7, and 3 of Diamonds\n• 10, 8, 5, 4, and 3 of Clubs\n\nTie-breaker: The player holding the highest single card in their flush wins. If the highest cards tie, you compare the second-highest card, then the third, and so on. If all five cards have the exact same ranks across different suits, the pot is split (suits have no rank in Texas Hold'em).",                                                                                                                                                          bg:"rgba(240,192,64,0.15)", border:"rgba(240,192,64,0.52)",clr:"#f0c040",              dim:"rgba(200,165,45,0.80)"},
    {name:"Full House",      hint:"Three of a Kind + a Pair",                     detail:"A five-card combination containing exactly three cards of one rank, and exactly two cards of another rank. It is essentially a Three of a Kind merged with a Pair.\n\nExamples:\n• Three Kings and Two 4s (\"Kings full of 4s\")\n• Three 10s and Two Aces (\"10s full of Aces\")\n• Three 5s and Two 9s (\"5s full of 9s\")\n\nTie-breaker: The tie is broken first by comparing the Three of a Kind part of the hand. The higher three-card set wins. If players share the same Three of a Kind (possible with community cards), the tie is broken by comparing the Pair. If both the trio and the pair are identical, the pot is split.",                                                                                                                               bg:"rgba(230,160,50,0.16)", border:"rgba(228,152,38,0.54)",clr:"#e8a830",              dim:"rgba(195,135,35,0.80)"},
    {name:"Four of a Kind",  hint:"Four cards of the same rank",                  detail:"A hand containing all four cards of the exact same rank from the deck, accompanied by one unrelated side card (the kicker).\n\nExamples:\n• Four Aces and a 9\n• Four 7s and a King\n• Four 2s and a Jack\n\nTie-breaker: The player with the highest-ranking set of four cards wins (e.g., Four 10s beat Four 8s). If multiple players share the exact same Four of a Kind (which happens if the four cards are on the community board), the player with the highest 5th card (the kicker) wins.",                                                                                                                                                                bg:"rgba(220,128,38,0.17)", border:"rgba(218,118,28,0.56)",clr:"#e09028",              dim:"rgba(180,115,28,0.80)"},
    {name:"Straight Flush",  hint:"Five cards in sequence, same suit",            detail:"Five cards in sequential numerical order, all of which share the exact same suit. It combines the criteria of both a straight and a flush.\n\nExamples:\n• 8, 9, 10, Jack, and Queen of Diamonds\n• 5, 6, 7, 8, and 9 of Clubs\n• Ace, 2, 3, 4, and 5 of Hearts (\"Steel Wheel\")\n\nTie-breaker: If two players have a straight flush, the player with the highest-ranking top card wins. For example, a Queen-high straight flush beats a 9-high straight flush. If both players have the exact same rank of straight flush, the pot is split.",                                                                                                                                                                                      bg:"rgba(160,80,220,0.14)", border:"rgba(175,88,228,0.48)",clr:"#c8a0ff",              dim:"rgba(160,120,220,0.75)"},
    {name:"Royal Flush",     hint:"10-J-Q-K-A all same suit",                     detail:"The rarest and most powerful hand in poker. It consists of the five highest-ranking cards in the deck, all perfectly sequenced and sharing the exact same suit. It is essentially an Ace-high Straight Flush and is mathematically the hardest combination to draw.\n\nExamples:\n• Ace, King, Queen, Jack, and 10 of Spades\n• Ace, King, Queen, Jack, and 10 of Hearts\n• Ace, King, Queen, Jack, and 10 of Clubs\n\nTie-breaker: A Royal Flush cannot be beaten. If two players somehow manage to form a Royal Flush in Texas Hold'em (which is only possible if all five cards are on the community board), the pot is split equally. Suits do not break ties.",                                                                                                                                                                                                       bg:"rgba(140,60,200,0.18)", border:"rgba(160,80,220,0.55)",clr:"#ddb8ff",              dim:"rgba(180,140,230,0.75)"},
];
function HandRankModal({onClose}){
    const [open,setOpen]=useState(Array(10).fill(false));
    const toggle=i=>setOpen(prev=>prev.map((v,j)=>j===i?!v:v));
    return(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16,boxSizing:"border-box"}}>
            <div style={{maxWidth:400,width:"100%",maxHeight:"86vh",overflowY:"auto",background:"rgba(8,18,12,0.98)",border:"1px solid rgba(240,192,64,0.3)",borderRadius:20,padding:"18px 14px",boxSizing:"border-box"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <span style={{color:G,fontWeight:800,fontSize:15}}>🃏 Ranking: Lowest to Highest</span>
                    <Btn sm bg="#333" onClick={onClose}>✕</Btn>
                </div>
                {HANDS.map((hr,i)=>(
                    <div key={i} onClick={()=>toggle(i)} style={{background:hr.bg,border:`1px solid ${hr.border}`,borderRadius:10,padding:"10px 12px",marginBottom:7,cursor:"pointer",userSelect:"none"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{color:hr.clr,fontWeight:800,fontSize:14,whiteSpace:"nowrap"}}>{i+1}. {hr.name}</span>
                            <span style={{color:hr.dim,fontSize:12,flex:1,textAlign:"right"}}>{hr.hint}</span>
                            <span style={{color:hr.dim,fontSize:11,flexShrink:0}}>{open[i]?"▲":"▼"}</span>
                        </div>
                        {open[i]&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${hr.border}`,color:hr.dim,fontSize:13,lineHeight:1.55,whiteSpace:'pre-line'}}>{hr.detail}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
}
function PotDetailModal({ pots, players, onClose }) {
  return (
    <Ov><DB>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <span style={{color:G, fontWeight:800, fontSize:15}}>💰 Pot Breakdown</span>
        <Btn sm bg="#333" onClick={onClose}>✕</Btn>
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {pots.map((pot, i) => (
          <div key={i} style={{
            background:'rgba(0,0,0,0.35)',
            border:'1px solid rgba(240,192,64,0.2)',
            borderRadius:12,
            padding:'10px 12px'
          }}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
              <span style={{fontSize:12, fontWeight:700, color:G, textTransform:'uppercase', letterSpacing:0.5}}>{pot.label}</span>
              <span style={{fontSize:16, fontWeight:900, color:G}}>{pot.amount}</span>
            </div>
            <div style={{fontSize:11, color:DIM, marginBottom:5}}>Eligible:</div>
            {pot.eligible.map(ep => {
              const pIdx = players.findIndex(p => p.id === ep.id);
              return (
                <div key={ep.id} style={{display:'flex', alignItems:'center', gap:6, marginBottom:2}}>
                  <div style={{width:6, height:6, borderRadius:'50%', background:PLAYER_COLORS[pIdx % PLAYER_COLORS.length]}} />
                  <span style={{fontSize:12, color:'#fff', fontWeight:600}}>{ep.name}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </DB></Ov>
  );
}
function HandHistoryModal({ history, currentSn, onClose }) {
    const sessionHistory = (history || []).filter(h => h.sn === currentSn);
    return (
        <Ov><DB>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
                <span style={{color:G, fontWeight:800, fontSize:15}}>📈 Session {currentSn} — Hand History</span>
                <Btn sm bg="#333" onClick={onClose}>✕</Btn>
            </div>
            {!sessionHistory.length ? (
                <p style={{color:DIM, fontSize:13, margin:0}}>No hands completed yet this session.</p>
            ) : (
                <div style={{maxHeight:'66vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:6}}>
                    {sessionHistory.map(h => {
                        const participantIds = Object.keys(h.stacks || {});
                        return (
                            <div key={h.hn} style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'8px 10px'}}>
                                <div style={{fontSize:10, fontWeight:800, color:DIM, letterSpacing:1, textTransform:'uppercase', marginBottom:5}}>
                                    Hand {h.hn}{h.hr ? <span style={{fontWeight:600, marginLeft:6}}>— {h.hr}</span> : ''}
                                </div>
                                <div style={{display:'flex', flexDirection:'column', gap:2}}>
                                    {participantIds.map(pid => {
                                        const isWinner = pid === h.wid;
                                        const name = (h.playerNames && h.playerNames[pid]) || '?';
                                        const stack = h.stacks[pid] ?? null;
                                        const delta = h.net ? (h.net[pid] ?? null) : null;
                                        const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0';
                                        return (
                                            <div key={pid} style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', fontSize:12, color: isWinner ? G : 'rgba(255,255,255,0.65)'}}>
                                                <span style={{fontWeight: isWinner ? 700 : 400}}>{name}</span>
                                                <span style={{fontVariantNumeric:'tabular-nums'}}>
                                                    {stack !== null ? stack : '—'}
                                                    {delta !== null && <span style={{fontSize:10, marginLeft:4, opacity:0.75}}>({deltaStr})</span>}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </DB></Ov>
    );
}
export { HoleCard, CommCard, getCommunityCards, AnimatedPot, AnimatedSidePot, CDlg, SSDlg, HRDlg, StatsMod, ChipStackSVG, buildPots, HandRankModal, PotDetailModal, HandHistoryModal };
