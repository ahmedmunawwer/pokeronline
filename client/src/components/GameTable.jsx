/* GameTable — polished hi-fi mockup of the in-game screen.
   Diffs from handover applied + further refinements. */

const { useState, useEffect } = React;

/* Seat positions — equal-angular spacing around an ellipse so the seats form
   an arch above the local player. Outer seats (j=1, j=n-1) sit low next to
   "You"; the apex grows with player count without overflowing the felt. */
function getSeatPositions(n) {
  if (n <= 1) return [{ left: 50, top: 92 }];

  const cx = 50,cy = 50;
  const rx = 40,ry = 42;
  const startAngle = 90; // local player at the bottom
  const step = 360 / n; // even spacing around the table

  return Array.from({ length: n }, (_, j) => {
    const th = (startAngle + j * step) * Math.PI / 180;
    return {
      left: Math.round((cx + rx * Math.cos(th)) * 10) / 10,
      top: Math.round((cy + ry * Math.sin(th)) * 10) / 10
    };
  });
}

/* Suits set, gives one demo hole hand to local player */
const SUITS = { '♠': false, '♣': false, '♥': true, '♦': true };

function GameTable({ gameState, tw }) {
  const orientation = (tw && tw.orientation) || 'horizontal';

  /* Keep the right rail card the same height as the poker table at desktop /
     iPhone landscape widths, no matter the player count. Skip when the user
     has forced the vertical layout via the orientation tweak. */
  useEffect(() => {
    const sync = () => {
      const table = document.querySelector('.poker-table-bg');
      const rail = document.querySelector('.rail-card');
      const shell = document.querySelector('.gt-shell');
      if (!table || !rail || !shell) return;
      const isVertical = shell.classList.contains('gt-shell--vertical');
      if (!isVertical && window.innerWidth >= 720) {
        const h = table.offsetHeight;
        if (h) rail.style.height = h + 'px';
      } else {
        rail.style.height = '';
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    const table = document.querySelector('.poker-table-bg');
    if (table) ro.observe(table);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  });

  const {
    phase, players, cfg, pot, dealer, queue,
    rBets, curBet, lr, ba,
    myId, isHost, community, hn, sn
  } = gameState;

  const n = players.length;
  const myIdx = players.findIndex((p) => p.id === myId);
  const myLocalIdx = myIdx === -1 ? 0 : myIdx;
  const seatPositions = getSeatPositions(n);
  const actI = queue && queue.length > 0 ? queue[0] : null;
  const actP = actI !== null && actI !== undefined ? players[actI] : null;
  const isBet = ['preflop', 'flop', 'turn', 'river'].includes(phase);
  const isMyTurn = isBet && actP && actP.id === myId;
  const toCall = isBet && actP ? curBet - (rBets[actI] || 0) : 0;
  const sbI = (dealer + 1) % n;
  const bbI = (dealer + 2) % n;

  /* Visible community cards based on phase */
  const visibleCommunity = (() => {
    if (phase === 'preflop' || phase === 'preflop_start') return [];
    if (phase === 'flop') return community.slice(0, 3);
    if (phase === 'turn') return community.slice(0, 4);
    if (phase === 'river' || phase === 'showdown' || phase === 'end') return community.slice(0, 5);
    return [];
  })();

  const pg = {
    minHeight: '100vh',
    color: '#fff',
    padding: '12px 14px 18px',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    boxSizing: 'border-box'
  };

  return (
    <div style={pg}>
            <div className={"gt-shell" + (orientation === 'vertical' ? ' gt-shell--vertical' : '')}>

                {/* ── Status header (single line, both orientations) ────── */}
                <div className="gt-header" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10,
          padding: '8px 12px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          backdropFilter: 'blur(8px)',
          gap: 12
        }}>
                    <div style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            flex: 1, minWidth: 0, overflow: 'hidden',
            whiteSpace: 'nowrap'
          }}>
                        <div style={{ fontSize: 16, fontWeight: 900, color: G, letterSpacing: 1.2, flexShrink: 0 }}>
                            {PHASE_LABEL[phase] || phase}
                        </div>
                        <div style={{
              fontSize: 10,
              color: DIM_STRONG,
              letterSpacing: 1.2,
              fontWeight: 700,
              textTransform: 'uppercase',
              overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
                            <span>Session {sn}/{cfg.sessions}</span>
                            <span style={{ color: DIM, margin: '0 6px' }}>·</span>
                            <span>Hand #{hn}</span>
                            <span style={{ color: DIM, margin: '0 6px' }}>·</span>
                            <span style={{ color: DIM_STRONG, fontWeight: 600 }}>Blinds {cfg.sb}/{cfg.bb}</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <HeaderIconBtn ring="red" title="Home">🏠</HeaderIconBtn>
                        {isHost && <HeaderIconBtn ring="amber" title="Save">💾</HeaderIconBtn>}
                        <HeaderIconBtn ring="gold" title="Hand ranks">🃏</HeaderIconBtn>
                        <HeaderIconBtn ring="gold-strong" title="Stats">📊</HeaderIconBtn>
                    </div>
                </div>

              <div className="gt-main">
                <div className="poker-table-bg" style={{ position: 'relative', isolation: 'isolate' }}>

                    {/* Pot + community cards (vertical center stack) */}
                    <CenterStack
              pot={pot}
              visibleCommunity={visibleCommunity}
              phase={phase} />
            

                    {/* Players */}
                    {players.map((_, j) => {
              const i = (myLocalIdx + j) % n;
              const p = players[i];
              const pos = seatPositions[j] || { left: 50, top: 50 };
              const isAct = i === actI && isBet;
              const hasActed = isBet && queue && !queue.includes(i);

              const betAmt = rBets[i] || 0;
              const hasBet = betAmt > 0;
              const dx = 50 - pos.left;
              const dy = 50 - pos.top;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              /* Push bet chips a short distance from the player toward the
                 table center — kept conservative so chips never invade the
                 community-card row. */
              const pushX = dx / dist * 40;
              const pushY = dy / dist * 34;

              const isLocal = p.id === myId;
              const remoteScale = Math.max(0.7, 1 - (n - 3) * 0.05);
              const innerScale = isLocal ?
              isAct ? 1.04 : 1 :
              isAct ? 1.45 * remoteScale : remoteScale;

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
                    transformOrigin: isLocal ? 'center bottom' : 'center',
                    transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)'
                  }}>
                                    {/* Personal chip stack to the left */}
                                    {p.stack > 0 && !isLocal &&
                    <div style={{ position: 'absolute', right: '100%', bottom: 18, width: 14, marginRight: 6 }}>
                                            <ChipStackSVG amount={p.stack} maxChips={7} />
                                        </div>
                    }

                                    {/* Bet chips pushed toward center */}
                                    {hasBet &&
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: `translate(calc(-50% + ${pushX}px), calc(-50% + ${pushY}px))`,
                      pointerEvents: 'none',
                      transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                      zIndex: 1,
                      display: 'flex', flexDirection: 'column', alignItems: 'center'
                    }}>
                                            <div style={{ width: 18 }}>
                                                <ChipStackSVG amount={betAmt} maxChips={6} />
                                            </div>
                                            <div style={{
                        fontSize: 9, fontWeight: 800, color: '#fff',
                        background: 'rgba(0,0,0,0.7)', padding: '1px 5px',
                        borderRadius: 10, marginTop: 2,
                        border: `1px solid ${G}`,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.4)'
                      }}>{betAmt}</div>
                                        </div>
                    }

                                    {/* Hole cards */}
                                    {!p.folded &&
                    <div style={{
                      display: 'flex', marginBottom: -6, marginTop: -14, zIndex: 2,
                      position: 'relative', transform: 'scale(0.58)', transformOrigin: 'center bottom'
                    }}>
                                            <HoleCard up={isLocal || phase === 'showdown' || phase === 'end' || hasActed}
                      rank={isLocal ? 'A' : '?'} suit="♥" red={true} />
                                            <HoleCard up={isLocal || phase === 'showdown' || phase === 'end' || hasActed}
                      rank={isLocal ? 'K' : '?'} suit="♠" red={false} />
                                        </div>
                    }

                                    {/* Acting state is now conveyed via larger scale + brighter glow only —
                      no separate ● Acting tab. */}

                                    {/* Player Box */}
                                    {isLocal ?
                    <LocalPlayerPill p={p} i={i} isAct={isAct} sbI={sbI} bbI={bbI} dealer={dealer} betAmt={betAmt} hasBet={hasBet} /> :
                    <RemotePlayerStrip p={p} i={i} isAct={isAct} sbI={sbI} bbI={bbI} dealer={dealer} />
                    }
                                </div>
                            </div>);

            })}
                </div>

                {/* ── Bottom action strip removed — moved into the right rail ── */}
              </div>

              {/* ── Side rail: one wood-bordered card holding actions · stacks · last action ───── */}
              <aside className="gt-rail">
                <div className="wood-card rail-card">
                  <div className="wood-card__inner rail-card__inner">

                    {/* Section 1: action buttons (or waiting strip when not your turn) */}
                    <div className="rail-section rail-section--actions">
                        {isBet && actP && (
                isMyTurn ?
                <RailActionBar
                  toCall={toCall}
                  raiseLabel={ba}
                  myStack={players[myLocalIdx].stack}
                  minRaise={lr} /> :

                <RailWaitingStrip name={actP.name} />)
                }
                    </div>

                    {/* Section 2: player stacks for the current session */}
                    <div className="rail-section rail-section--stacks">
                        <PlayerStacks
                  players={players}
                  dealer={dealer} sbI={sbI} bbI={bbI} actI={actI}
                  myId={myId}
                  sessionNum={sn}
                  sessionsTotal={cfg.sessions} />
                
                    </div>

                    {/* Section 3: last action — color-coded by event type */}
                    <div className="rail-section rail-section--last">
                        <LastActionPanel log={gameState.log} rBets={rBets} curBet={curBet} />
                    </div>

                  </div>
                </div>
              </aside>
            </div>
        </div>);

}

/* ─────────────── Sub-components ─────────────── */

const HeaderIconBtn = ({ children, ring, title }) => {
  const styles = {
    red: { bg: 'rgba(255,100,100,0.10)', br: 'rgba(255,100,100,0.30)' },
    amber: { bg: 'rgba(100,180,100,0.14)', br: 'rgba(100,180,100,0.36)' },
    gold: { bg: 'rgba(240,192,64,0.12)', br: 'rgba(240,192,64,0.32)' },
    'gold-strong': { bg: 'rgba(240,192,64,0.20)', br: 'rgba(240,192,64,0.45)' }
  };
  const s = styles[ring] || styles.gold;
  return (
    <button title={title} style={{
      background: s.bg, border: `1px solid ${s.br}`,
      borderRadius: '50%', width: 30, height: 30,
      fontSize: 13, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
    }}>{children}</button>);

};

const CenterStack = ({ pot, visibleCommunity, phase }) => {
  const haveCards = visibleCommunity.length > 0;
  return (
    <div style={{
      position: 'relative', zIndex: 25,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 8
    }}>
            {/* Pot */}
            <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%)',
        border: '1px solid rgba(240,192,64,0.45)',
        borderRadius: 999,
        padding: '4px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        minWidth: 110
      }}>
                <div style={{
          fontSize: 9, color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 800
        }}>Main Pot</div>
                <div style={{
          fontSize: 18, fontWeight: 900, color: G, lineHeight: 1.1,
          textShadow: '0 0 12px rgba(240,192,64,0.4)'
        }}>{pot}</div>
            </div>

            {/* Community cards */}
            {haveCards &&
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                    {visibleCommunity.map((c, i) =>
        <CommCard key={i} up={true} rank={c.rank} suit={c.suit} red={c.red} />
        )}
                    {/* Reserve slots for undealt cards */}
                    {Array.from({ length: 5 - visibleCommunity.length }).map((_, i) =>
        <div key={`g${i}`} style={{
          width: 30, height: 42,
          borderRadius: 4,
          border: '1px dashed rgba(255,255,255,0.10)',
          background: 'rgba(0,0,0,0.18)'
        }} />
        )}
                </div>
      }

            {/* preflop: show 5 placeholders */}
            {!haveCards &&
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    {Array.from({ length: 5 }).map((_, i) =>
        <div key={i} style={{
          width: 30, height: 42,
          borderRadius: 4,
          border: '1px dashed rgba(255,255,255,0.10)',
          background: 'rgba(0,0,0,0.18)'
        }} />
        )}
                </div>
      }
        </div>);

};

const LocalPlayerPill = ({ p, i, isAct, sbI, bbI, dealer, betAmt, hasBet }) =>
<div className={`local-player-pill ${isAct ? 'acting-ring-big' : ''}`} style={{
  width: 110,
  background: `
            repeating-linear-gradient(92deg,  rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 7px),
            repeating-linear-gradient(88deg,  rgba(0,0,0,0.18)       0px, rgba(0,0,0,0.18)       1px, transparent 1px, transparent 11px),
            repeating-linear-gradient(91deg,  rgba(255,220,140,0.07) 0px, rgba(255,220,140,0.07) 2px, transparent 2px, transparent 18px),
            linear-gradient(160deg, #7a4a18 0%, #a0661e 18%, #6b3c10 30%, #b87333 42%, #7a4a18 55%, #9c5c1a 68%, #6b3c10 80%, #a07030 100%)`,
  borderTop: `3px solid ${G}`,
  borderLeft: `3px solid ${G}`,
  borderRight: `3px solid ${G}`,
  borderBottom: 'none',


  textAlign: 'center',
  position: 'relative',
  overflow: 'hidden',
  opacity: p.inactive ? 0.55 : p.folded ? 0.7 : 1,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', borderRadius: "14px 14px 0px 0px", padding: "15px 12px 10px", borderStyle: "double", borderWidth: "4px 4px 0px", borderColor: "rgb(174, 134, 27)"
}}>
        {/* Quarter-circle position badges */}
        {i === sbI && <CornerBadge corner="tl" bg="#42a5f5" fg="#fff">SB</CornerBadge>}
        {i === bbI && <CornerBadge corner="tl" bg="#ef5350" fg="#fff">BB</CornerBadge>}
        {i === dealer && <CornerBadge corner="tr" bg="#fff" fg="#000">D</CornerBadge>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{
      width: 9, height: 9, borderRadius: '50%',
      background: p.inactive ? '#999' : PLAYER_COLORS[i % PLAYER_COLORS.length],
      boxShadow: `0 0 8px ${p.inactive ? 'transparent' : PLAYER_COLORS[i % PLAYER_COLORS.length]}`
    }}></div>
            {p.inactive && <span style={{ fontSize: 10, fontWeight: 700, color: '#888' }}>LEFT</span>}
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: p.folded || p.inactive ? DIM : G, letterSpacing: 0.3, lineHeight: 1.1 }}>
            {p.inactive ? '—' : p.stack.toLocaleString()}
        </div>
        {p.folded && !p.inactive &&
  <div style={{
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%,-50%) rotate(-12deg)',
    background: 'rgba(200,50,50,0.9)', color: '#fff',
    fontSize: 10, fontWeight: 900, padding: '2px 12px', borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.3)', pointerEvents: 'none',
    letterSpacing: 1
  }}>FOLDED</div>
  }
    </div>;


const RemotePlayerStrip = ({ p, i, isAct, sbI, bbI, dealer }) =>
<div className={isAct ? 'acting-ring' : ''} style={{
  background: p.folded ?
  'rgba(0,0,0,0.55)' :
  'linear-gradient(180deg, rgba(20,32,24,0.95) 0%, rgba(12,22,16,0.92) 100%)',
  border: `1px solid ${isAct ? G : p.folded || p.inactive ? 'rgba(255,255,255,0.08)' : 'rgba(93,64,55,0.55)'}`,
  borderRadius: 10,
  padding: '5px 8px',
  position: 'relative',
  boxShadow: isAct ? null : '0 4px 10px rgba(0,0,0,0.45)',
  opacity: p.inactive ? 0.5 : p.folded ? 0.45 : 1,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap'
}}>
        <div style={{
    width: 7, height: 7, borderRadius: '50%',
    background: p.inactive ? '#999' : PLAYER_COLORS[i % PLAYER_COLORS.length],
    boxShadow: `0 0 5px ${p.inactive ? 'transparent' : PLAYER_COLORS[i % PLAYER_COLORS.length]}`,
    flexShrink: 0
  }}></div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{
      fontSize: 10, fontWeight: 700,
      color: p.folded ? 'rgba(255,255,255,0.45)' : '#fff',
      textDecoration: p.folded ? 'line-through' : 'none',
      maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis',
      lineHeight: 1.15
    }}>{p.inactive ? 'LEFT' : p.name}</div>
            <div style={{
      fontSize: 9, fontWeight: 800,
      color: p.folded || p.inactive ? DIM : G,
      lineHeight: 1.1, letterSpacing: 0.3
    }}>{p.inactive ? '—' : p.stack.toLocaleString()}</div>
        </div>
        {i === sbI && <PositionDot color="#42a5f5">SB</PositionDot>}
        {i === bbI && <PositionDot color="#ef5350">BB</PositionDot>}
        {i === dealer && <PositionDot color="#f0c040">D</PositionDot>}
        {p.folded && !p.inactive &&
  <div style={{ fontSize: 8, fontWeight: 900, color: 'rgba(255,100,100,0.85)', lineHeight: 1, letterSpacing: 0.5 }}>FOLD</div>
  }
    </div>;


const PositionDot = ({ color, children }) =>
<div style={{
  fontSize: 8, fontWeight: 900, color,
  background: `${color}1f`,
  border: `1px solid ${color}55`,
  borderRadius: 4,
  padding: '1px 4px',
  lineHeight: 1,
  letterSpacing: 0.3
}}>{children}</div>;


const CornerBadge = ({ corner, bg, fg, children }) => {
  const isLeft = corner === 'tl';
  return (
    <div style={{
      position: 'absolute', top: 0, [isLeft ? 'left' : 'right']: 0,
      background: bg, color: fg,
      width: 26, height: 26,
      borderRadius: isLeft ? '0 0 26px 0' : '0 0 0 26px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 900,
      paddingBottom: 4,
      [isLeft ? 'paddingRight' : 'paddingLeft']: 4,
      boxSizing: 'border-box',
      letterSpacing: 0.3
    }}>{children}</div>);

};

/* Action bar – the three-button strip below the table */
const ActionBar = ({ toCall, raiseLabel, myStack, minRaise }) => {
  return (
    <div className="action-bar" style={{
      display: 'flex',
      height: 56,
      width: '100%',
      borderRadius: '0 0 16px 16px',
      overflow: 'hidden',
      marginBottom: 8,
      border: '1px solid rgba(255,255,255,0.07)',
      borderTop: 'none',
      boxShadow: '0 12px 24px rgba(0,0,0,0.5)'
    }}>
            <ActionButton
        color="#1565c0" hover="#1976d2"
        primary={toCall === 0 ? 'Check' : 'Call'}
        secondary={toCall === 0 ? null : toCall.toLocaleString()}
        cornerLeft />
      
            <ActionButton
        color="#b8880e" hover="#c89818"
        primary={raiseLabel || 'Raise'}
        secondary={`Min ${minRaise}`} />
      
            <ActionButton
        color="#8b1a1a" hover="#a01f1f"
        primary="Fold"
        secondary={null}
        cornerRight />
      
        </div>);

};

const ActionButton = ({ color, primary, secondary, cornerLeft, cornerRight }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        background: hover ?
        `linear-gradient(180deg, ${shade(color, 8)} 0%, ${color} 100%)` :
        `linear-gradient(180deg, ${color} 0%, ${shade(color, -16)} 100%)`,
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
        borderRadius: cornerLeft ? '0 0 0 14px' : cornerRight ? '0 0 14px 0' : 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 1,
        transition: 'background 120ms ease, transform 80ms ease',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.25)', padding: "0px 8px"

      }}>
      
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.15 }}>{primary}</div>
            {secondary &&
      <div style={{
        fontSize: 10, fontWeight: 700,
        color: 'rgba(255,255,255,0.78)', letterSpacing: 0.3, lineHeight: 1
      }}>{secondary}</div>
      }
        </button>);

};

function shade(hex, lum) {
  /* simple lightness shift on #rrggbb */
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) + lum,g = (num >> 8 & 0xff) + lum,b = (num & 0xff) + lum;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

const WaitingStrip = ({ name }) =>
<div className="action-bar" style={{
  height: 56,
  background: 'linear-gradient(180deg, rgba(10,5,2,0.95) 0%, rgba(20,12,6,0.95) 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: DIM_STRONG, fontSize: 13,
  borderRadius: '0 0 16px 16px',
  marginBottom: 8,
  gap: 8,
  border: '1px solid rgba(255,255,255,0.07)',
  borderTop: 'none'
}}>
        <span style={{
    width: 6, height: 6, borderRadius: '50%',
    background: G,
    boxShadow: `0 0 8px ${G}`,
    animation: 'actingPulse 1.6s ease-in-out infinite'
  }} />
        Waiting for <span style={{ color: G, fontWeight: 700 }}>{name}</span>
    </div>;


const ActionLog = ({ log, variant }) => {
  const isRail = variant === 'rail';
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '10px 12px',
      flex: isRail ? 1 : 'none',
      display: 'flex', flexDirection: 'column',
      minHeight: 0
    }}>
            <div style={{
        color: G, fontWeight: 800, fontSize: 10,
        letterSpacing: 1.2, textTransform: 'uppercase',
        marginBottom: 6,
        flexShrink: 0
      }}>Action Log</div>
            <div style={{
        maxHeight: isRail ? 'none' : 86,
        flex: isRail ? 1 : 'none',
        overflowY: 'auto', fontSize: 12, color: DIM_STRONG, lineHeight: 1.5
      }}>
                {(log || []).map((l, i) =>
        <div key={i} style={{
          padding: '3px 0',
          borderBottom: i < log.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
        }}>{l}</div>
        )}
            </div>
        </div>);

};

/* Small recent-hands strip that sits above the action log in the desktop rail.
   Just a peek at the last few hand outcomes — fake data is fine for a mockup. */
const HandHistoryPeek = ({ hn, sn, sessions }) => {
  const recent = [
  { h: hn - 1, won: true, amt: 425, by: 'Two Pair' },
  { h: hn - 2, won: false, amt: 200, by: 'folded' },
  { h: hn - 3, won: true, amt: 150, by: 'Top Pair' },
  { h: hn - 4, won: false, amt: 75, by: 'showdown' }];

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '10px 12px',
      flexShrink: 0
    }}>
            <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8
      }}>
                <div style={{
          color: G, fontWeight: 800, fontSize: 10,
          letterSpacing: 1.2, textTransform: 'uppercase'
        }}>Recent Hands</div>
                <div style={{
          fontSize: 9, color: DIM, letterSpacing: 0.5,
          fontWeight: 600, textTransform: 'uppercase'
        }}>Session {sn}/{sessions}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recent.map((r) =>
        <div key={r.h} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 6px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.18)',
          fontSize: 11
        }}>
                        <div style={{
            fontSize: 9, fontWeight: 800, color: DIM,
            width: 28, letterSpacing: 0.4
          }}>#{r.h}</div>
                        <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: r.won ? '#5db976' : 'rgba(255,255,255,0.18)',
            boxShadow: r.won ? '0 0 6px rgba(93,185,118,0.6)' : 'none',
            flexShrink: 0
          }} />
                        <div style={{
            flex: 1, color: r.won ? '#fff' : DIM_STRONG,
            fontWeight: r.won ? 700 : 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>{r.by}</div>
                        <div style={{
            fontSize: 11, fontWeight: 800,
            color: r.won ? G : DIM,
            letterSpacing: 0.3
          }}>{r.won ? '+' : '−'}{r.amt}</div>
                    </div>
        )}
            </div>
        </div>);

};

/* ─────────────── Rail components: actions · stacks · last action ─────────────── */

/* Action buttons relocated to the top of the right rail.
   Kept the same Check/Call · Bet/Raise · Fold horizontal layout. */
const RailActionBar = ({ toCall, raiseLabel, minRaise }) =>
<div className="action-bar" style={{
  display: 'flex',
  height: 56,
  /* No explicit width — auto-width lets the negative left/right margins
     actually extend the box to BOTH inner edges. With `width:100%` the
     box stays at content-box width and the right edge falls 12px short
     of the wood, so the Fold button doesn't tuck. */
  /* Bleed sideways + upward to the inner edges of the wood card so the
     buttons sweep into the rounded top corners (mirror of LastActionPanel). */
  margin: '-10px -12px 0 -12px',
  borderTopLeftRadius: 'inherit',
  borderTopRightRadius: 'inherit',
  borderBottom: '1px solid rgba(240,192,64,0.18)',
  overflow: 'hidden'
}}>
        <ActionButton
    color="#1565c0" hover="#1976d2"
    primary={toCall === 0 ? 'Check' : 'Call'}
    secondary={toCall === 0 ? null : toCall.toLocaleString()} />

        <ActionButton
    color="#b8880e" hover="#c89818"
    primary={raiseLabel || 'Raise'}
    secondary={`Min ${minRaise}`} />

        <ActionButton
    color="#8b1a1a" hover="#a01f1f"
    primary="Fold" />

    </div>;

/* Waiting strip gets the same corner-tucked treatment. */
const RailWaitingStrip = ({ name }) =>
<div className="action-bar" style={{
  height: 56,
  background: 'linear-gradient(180deg, rgba(10,5,2,0.95) 0%, rgba(20,12,6,0.95) 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: DIM_STRONG, fontSize: 13,
  margin: '-10px -12px 0 -12px',
  borderTopLeftRadius: 'inherit',
  borderTopRightRadius: 'inherit',
  borderBottom: '1px solid rgba(240,192,64,0.18)',
  gap: 8
}}>
        <span style={{
    width: 6, height: 6, borderRadius: '50%',
    background: G,
    boxShadow: `0 0 8px ${G}`,
    animation: 'actingPulse 1.6s ease-in-out infinite'
  }} />
        Waiting for <span style={{ color: G, fontWeight: 700 }}>{name}</span>
    </div>;


/* Player stacks list — sits inside the unified rail wood-card.
   Sorted by seat so it tracks the table layout. */
const PlayerStacks = ({ players, dealer, sbI, bbI, actI, myId, sessionNum, sessionsTotal }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
        flexShrink: 0
      }}>
                <div style={{
          color: G, fontWeight: 800, fontSize: 10,
          letterSpacing: 1.2, textTransform: 'uppercase'
        }}>Stacks</div>
                <div style={{
          fontSize: 9, color: DIM, letterSpacing: 0.5,
          fontWeight: 600, textTransform: 'uppercase'
        }}>Session {sessionNum}/{sessionsTotal}</div>
            </div>
            <div style={{
        display: 'flex', flexDirection: 'column', gap: 3,
        flex: '1 1 auto', minHeight: 0
      }}>
                {players.map((p, i) => {
          const isMe = p.id === myId;
          const isAct = i === actI;
          const positionTag =
          i === dealer ? { l: 'D', c: '#f0c040' } :
          i === sbI ? { l: 'SB', c: '#42a5f5' } :
          i === bbI ? { l: 'BB', c: '#ef5350' } : null;
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 8px',
              borderRadius: 6,
              background: isAct ?
              'rgba(240,192,64,0.14)' :
              isMe ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.22)',
              border: isAct ? `1px solid rgba(240,192,64,0.55)` : '1px solid transparent',
              opacity: p.folded ? 0.45 : 1,
              transition: 'all 200ms ease',
              /* Distribute the available height: natural ~32px, shrinkable down to 22px. */
              flex: '0 1 32px',
              minHeight: 22
            }}>
                            <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: PLAYER_COLORS[i % PLAYER_COLORS.length],
                boxShadow: `0 0 5px ${PLAYER_COLORS[i % PLAYER_COLORS.length]}`,
                flexShrink: 0
              }} />
                            <div style={{
                flex: 1, minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                                <div style={{
                  fontSize: 12, fontWeight: isMe ? 800 : 600,
                  color: p.folded ? DIM : '#fff',
                  textDecoration: p.folded ? 'line-through' : 'none',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  letterSpacing: 0.2
                }}>{p.name}</div>
                                {positionTag &&
                <div style={{
                  fontSize: 8, fontWeight: 900, color: positionTag.c,
                  background: `${positionTag.c}1f`,
                  border: `1px solid ${positionTag.c}55`,
                  borderRadius: 3, padding: '1px 4px',
                  letterSpacing: 0.3, lineHeight: 1,
                  flexShrink: 0
                }}>{positionTag.l}</div>
                }
                            </div>
                            <div style={{
                fontSize: 12, fontWeight: 800,
                color: p.folded ? DIM : G,
                letterSpacing: 0.3, fontVariantNumeric: 'tabular-nums'
              }}>{p.stack.toLocaleString()}</div>
                        </div>);

        })}
            </div>
        </div>);

};

/* Last-action panel — bottom of the rail.
   Color shifts by the type of the most recent action:
     check/call → neutral · bet → amber · raise → strong amber · fold → red */
function classifyAction(line) {
  if (!line) return { tone: 'idle', verb: '—' };
  const lc = line.toLowerCase();
  if (lc.includes('raise')) return { tone: 'raise' };
  if (lc.includes('bet')) return { tone: 'bet' };
  if (lc.includes('call')) return { tone: 'call' };
  if (lc.includes('check')) return { tone: 'check' };
  if (lc.includes('fold')) return { tone: 'fold' };
  if (lc.includes('flop') || lc.includes('turn') || lc.includes('river'))
  return { tone: 'deal' };
  if (lc.includes('your turn')) return { tone: 'idle' };
  return { tone: 'idle' };
}

const TONE_STYLES = {
  raise: {
    bg: 'linear-gradient(180deg, rgba(176,108,12,0.95) 0%, rgba(140,80,8,0.95) 100%)',
    border: 'rgba(240,192,64,0.85)',
    glow: '0 0 24px rgba(240,192,64,0.45), inset 0 0 0 1px rgba(255,220,120,0.3)',
    accent: '#ffd86b',
    label: 'Raise'
  },
  bet: {
    bg: 'linear-gradient(180deg, rgba(120,80,16,0.92) 0%, rgba(80,55,12,0.92) 100%)',
    border: 'rgba(240,192,64,0.55)',
    glow: '0 0 14px rgba(240,192,64,0.25)',
    accent: '#f0c040',
    label: 'Bet'
  },
  call: {
    bg: 'linear-gradient(180deg, rgba(20,40,68,0.92) 0%, rgba(14,28,48,0.92) 100%)',
    border: 'rgba(100,160,230,0.45)',
    glow: '0 4px 12px rgba(0,0,0,0.45)',
    accent: '#7ec0ff',
    label: 'Call'
  },
  check: {
    bg: 'linear-gradient(180deg, rgba(28,40,32,0.92) 0%, rgba(16,26,20,0.92) 100%)',
    border: 'rgba(255,255,255,0.10)',
    glow: '0 4px 12px rgba(0,0,0,0.45)',
    accent: '#9bd2a0',
    label: 'Check'
  },
  fold: {
    bg: 'linear-gradient(180deg, rgba(96,28,28,0.92) 0%, rgba(64,16,16,0.92) 100%)',
    border: 'rgba(220,90,90,0.55)',
    glow: '0 0 14px rgba(220,90,90,0.30)',
    accent: '#ff8d8d',
    label: 'Fold'
  },
  deal: {
    bg: 'linear-gradient(180deg, rgba(24,40,30,0.92) 0%, rgba(14,28,20,0.92) 100%)',
    border: 'rgba(120,180,140,0.32)',
    glow: '0 4px 12px rgba(0,0,0,0.45)',
    accent: '#9bd2a0',
    label: 'Deal'
  },
  idle: {
    bg: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
    border: 'rgba(255,255,255,0.10)',
    glow: '0 4px 12px rgba(0,0,0,0.45)',
    accent: DIM_STRONG,
    label: 'Idle'
  }
};

const LastActionPanel = ({ log }) => {
  const reversed = [...(log || [])].reverse();
  const lastBetIdx = reversed.findIndex((l) => /raise|bet|call|check|fold/i.test(l));
  const last = lastBetIdx >= 0 ? reversed[lastBetIdx] : reversed[0] || null;
  const { tone } = classifyAction(last);
  const s = TONE_STYLES[tone] || TONE_STYLES.idle;

  /* Parse name + verb out of "Name verbed amount" so we can style them apart. */
  const m = last && last.match(/^([A-Z][a-zA-Z]+)\s+(\w+)(?:\s+(?:to\s+)?([\d,]+))?/);
  const who = m ? m[1] : null;
  const verb = m ? m[2] : last || '—';
  const amt = m ? m[3] : null;

  return (
    <div style={{
      background: s.bg,
      boxShadow: s.glow,
      padding: '12px 26px 16px 26px',
      transition: 'background 300ms ease, box-shadow 300ms ease',
      position: 'relative',
      /* Bleed horizontally and downward to the inner edges of the wood-card,
         so the color wash meets the wood border directly. Keep top spacing
         from the section above intact. */
      margin: '0 -12px -10px -12px',
      borderTop: `1px solid ${s.border}`,
      borderBottomLeftRadius: 'inherit',
      borderBottomRightRadius: 'inherit'
    }}>
            <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 4
      }}>
                <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
          color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase'
        }}>Last Action</div>
                <div style={{
          fontSize: 9, fontWeight: 900, letterSpacing: 1,
          color: s.accent, textTransform: 'uppercase'
        }}>{s.label}</div>
            </div>
            <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6,
        fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 0.2,
        lineHeight: 1.2
      }}>
                {who && <span style={{ color: '#fff' }}>{who}</span>}
                <span style={{ color: s.accent, textTransform: 'lowercase' }}>{verb}</span>
                {amt &&
        <span style={{
          marginLeft: 'auto', color: s.accent, fontVariantNumeric: 'tabular-nums'
        }}>{amt}</span>
        }
            </div>
        </div>);

};

window.GameTable = GameTable;