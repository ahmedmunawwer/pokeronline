const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

const startIdx = content.indexOf('const HoleCard');
const endIdx = content.indexOf('function App()');

let uiCode = content.substring(startIdx, endIdx);

const header = `import React, { useState, useEffect, useRef } from 'react';
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
`;

const footer = `\nexport { HoleCard, CommCard, getCommunityCards, AnimatedPot, AnimatedSidePot, CDlg, SSDlg, HRDlg, StatsMod, ChipStackSVG, buildPots };\n`;

fs.writeFileSync('client/src/components/UI.jsx', header + uiCode + footer);
