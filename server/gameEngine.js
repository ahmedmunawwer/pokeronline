const TIERS = [["High Card","One Pair","Two Pair","Three of a Kind"],["Straight","Flush","Full House"],["Four of a Kind","Straight Flush","Royal Flush"]];
const RV = {"High Card":1,"One Pair":2,"Two Pair":3,"Three of a Kind":4,"Straight":5,"Flush":6,"Full House":7,"Four of a Kind":8,"Straight Flush":9,"Royal Flush":10};
const NP = { preflop: "flop_reveal", flop: "turn_reveal", turn: "river_reveal", river: "showdown" };

function calcSPts(sortedPlayers) {
    const n = sortedPlayers.length;
    const base = sortedPlayers.map((_, i) => n - 1 - i);
    const pts = {};
    let i = 0;
    while (i < n) {
        let j = i;
        while (j < n && sortedPlayers[j].stack === sortedPlayers[i].stack) j++;
        const tieCount = j - i;
        let sum = 0;
        for (let k = i; k < j; k++) sum += base[k];
        const shared = Math.round(sum / tieCount);
        for (let k = i; k < j; k++) pts[sortedPlayers[k].id] = shared;
        i = j;
    }
    return pts;
}

function buildPots(players, hc, aiIds) {
    const pIds = Object.keys(hc);
    if (!pIds.length) return [];

    // Total pot
    const totalPot = pIds.reduce((s, id) => s + (hc[id] || 0), 0);
    if (totalPot === 0) return [];

    // All non-folded players are eligible (dealer may have 0 contribution from checking)
    const activePlayers = players.filter(p => !p.folded);

    // If no all-in players, single pot
    if (!aiIds || !aiIds.length) {
        return [{
            amount: totalPot,
            eligible: activePlayers,
            label: "Main Pot"
        }];
    }

    // Get unique all-in contribution levels (ascending)
    const aiContribs = [...new Set(
        aiIds
            .filter(id => hc[id] > 0)
            .map(id => hc[id])
    )].sort((a, b) => a - b);

    if (!aiContribs.length) {
        return [{
            amount: totalPot,
            eligible: activePlayers,
            label: "Main Pot"
        }];
    }

    const pots = [];
    let prevLevel = 0;

    // Build pots level by level based on all-in amounts
    for (let k = 0; k < aiContribs.length; k++) {
        const level = aiContribs[k];
        const cap = level - prevLevel;
        if (cap <= 0) continue;

        // Everyone who contributed at least this level's amount
        let potAmt = 0;
        const eligible = [];

        for (const id of pIds) {
            const contrib = hc[id] || 0;
            const playerContribAtThisLevel = Math.min(contrib, level) - Math.min(contrib, prevLevel);
            potAmt += playerContribAtThisLevel;
            // Player is eligible if they contributed at least up to this level AND not folded
            // Players with 0 contrib are eligible for main pot (lowest tier)
            const player = players.find(p => p.id === id);
            if (player && !player.folded && (contrib >= level || (prevLevel === 0 && k === 0))) {
                eligible.push(player);
            }
        }

        if (potAmt > 0) {
            pots.push({ amount: potAmt, eligible, label: "Pot" });
        }
        prevLevel = level;
    }

    // Remaining contributions above the highest all-in level go to final pot
    const highestAI = aiContribs[aiContribs.length - 1];
    let remainAmt = 0;
    const remainEligible = [];

    for (const id of pIds) {
        const contrib = hc[id] || 0;
        const excess = contrib - Math.min(contrib, highestAI);
        remainAmt += excess;
        const player = players.find(p => p.id === id);
        if (player && !player.folded && contrib > highestAI) {
            remainEligible.push(player);
        }
    }

    if (remainAmt > 0 && remainEligible.length > 0) {
        pots.push({ amount: remainAmt, eligible: remainEligible, label: "Pot" });
    }

    // Label the pots
    if (pots.length === 0) return [];
    if (pots.length === 1) {
        pots[0].label = "Main Pot";
        return pots;
    }

    pots[0].label = "Main Pot";
    for (let i = 1; i < pots.length; i++) {
        pots[i].label = "Side Pot " + i;
    }

    return pots;
}

function addLog(state, msg) {
    state.log.unshift(msg);
}

function addAct(state, id, type, amt) {
    state.curActs = [...state.curActs, { id, type, amt }];
}

function makeBetLabel(rc) {
    if (rc === 0) return "bet";
    if (rc === 1) return "raise";
    if (rc === 2) return "re-raise";
    return (rc + 1) + "-bet";
}

function chainStr(chain) {
    return "$" + chain.join("→$");
}

function advance(state, nq, pls, ph2, hcN, aiN, rbN) {
    const alive = nq.filter(i => !pls[i].folded && pls[i].stack > 0);
    if (!alive.length) {
        let p2 = pls, hc2 = hcN, a2 = aiN;
        const r2 = rbN;
        const rbVals = Object.entries(r2).map(([k,v]) => ({i: Number(k), v}));
        
        if (rbVals.length > 0) {
            rbVals.sort((a,b) => b.v - a.v);
            const maxV = rbVals[0].v;
            const secV = rbVals.length > 1 ? rbVals[1].v : 0;
            if (maxV > secV) {
                const ref = maxV - secV;
                const refI = rbVals[0].i;
                const refId = pls[refI].id;
                p2 = p2.map((p,i) => i === refI ? {...p, stack: p.stack + ref} : p);
                hc2 = {...hcN, [refId]: (hcN[refId]||0) - ref};
                state.pot -= ref;
                state.hc = hc2;
                state.players = p2;
                if (a2.includes(refId)) {
                    a2 = a2.filter(id => id !== refId);
                    state.ai = a2;
                }
                addLog(state, pls[refI].name + " refunded " + ref + " (uncalled)");
            }
        }

        state.queue = [];
        state.rBets = {};
        state.curBet = 0;
        if (state.cfg) state.lr = state.cfg.bb;
        state.ba = "Bet";
        state.raiseCount = 0;
        state.rChain = [];
        state.lastBetInfo = null;

        const nxt = NP[ph2];
        state.phase = nxt;
        
        if (nxt === "showdown") {
            const c2 = buildPots(state.players, state.hc, state.ai);
            state.cp = c2;
            state.pi = c2.length - 1;
            addLog(state, "─ SHOWDOWN ─");
        } else {
            addLog(state, nxt.replace("_reveal","").toUpperCase() + " ROUND");
        }
    } else {
        state.queue = alive;
        addLog(state, pls[alive[0]].name + " — your action");
    }
}

function processAction(state, actionObj) {
    const { action, amount, playerId } = actionObj;
    const actI = state.queue && state.queue[0];
    
    // Meta actions that don't require turn verification
    if (['reveal', 'award_win', 'split_win', 'next_hand', 'next_session', 'next_pot', 'undo'].includes(action)) {
        // Fall through to the action handlers below
    } else {
        // Betting actions: verify it's the correct player's turn
        if (actI === undefined || !state.players[actI] || state.players[actI].id !== playerId) return false;
    }
    
    if (action === 'fold') {
        const i = actI;
        const np = state.players.map((p, j) => j === i ? { ...p, folded: true } : p);
        addAct(state, state.players[i].id, "fold", 0);
        state.players = np;
        addLog(state, state.players[i].name + " folds");
        
        if (np.filter(p => !p.folded).length === 1) {
            awardFinal(state, np.findIndex(p => !p.folded), np, state.pot);
            return true;
        }
        advance(state, state.queue.slice(1).filter(j => !np[j].folded && np[j].stack > 0), np, state.phase, state.hc, state.ai, state.rBets);
        
    } else if (action === 'check') {
        const i = actI;
        addAct(state, state.players[i].id, "check", 0);
        addLog(state, state.players[i].name + " checks");
        advance(state, state.queue.slice(1).filter(j => !state.players[j].folded && state.players[j].stack > 0), state.players, state.phase, state.hc, state.ai, state.rBets);
        
    } else if (action === 'call') {
        const i = actI;
        const prevBet = state.rBets[i] || 0;
        const toCall = state.curBet - prevBet;
        const amt = Math.min(toCall, state.players[i].stack);
        
        const np = state.players.map((p, j) => j === i ? { ...p, stack: p.stack - amt } : p);
        const nRB = { ...state.rBets, [i]: (state.rBets[i] || 0) + amt };
        const nHC = { ...state.hc, [state.players[i].id]: (state.hc[state.players[i].id] || 0) + amt };
        
        const isAI = np[i].stack === 0;
        let nAI = state.ai;
        if (isAI && !state.ai.includes(state.players[i].id)) {
            nAI = [...state.ai, state.players[i].id];
        }
        
        addAct(state, state.players[i].id, isAI ? "allin" : "call", amt);
        state.pot += amt;
        state.players = np;
        state.rBets = nRB;
        state.hc = nHC;
        if (isAI) {
            state.ai = nAI;
            addLog(state, state.players[i].name + " calls $" + amt + (state.lastBetInfo ? " (" + state.lastBetInfo.name + "'s " + state.lastBetInfo.label + ")" : "") + " (ALL IN)");
        } else {
            addLog(state, state.players[i].name + " calls $" + amt + (state.lastBetInfo ? " (" + state.lastBetInfo.name + "'s " + state.lastBetInfo.label + ")" : ""));
        }
        
        advance(state, state.queue.slice(1).filter(j => !np[j].folded && np[j].stack > 0), np, state.phase, nHC, nAI, nRB);
        
    } else if (action === 'raise') {
        const i = actI;
        const ra2 = Number(amount);
        if (!ra2 || ra2 < state.lr) return false;
        
        const prev = state.rBets[i] || 0;
        const cost = Math.min(state.curBet + ra2 - prev, state.players[i].stack);
        const actual = prev + cost;
        
        const np = state.players.map((p, j) => j === i ? { ...p, stack: p.stack - cost } : p);
        const nRB = { ...state.rBets, [i]: actual };
        const nHC = { ...state.hc, [state.players[i].id]: (state.hc[state.players[i].id] || 0) + cost };
        
        const isAI = np[i].stack === 0;
        let nAI = state.ai;
        if (isAI && !state.ai.includes(state.players[i].id)) {
            nAI = [...state.ai, state.players[i].id];
        }
        
        addAct(state, state.players[i].id, isAI ? "allin" : "raise", actual);
        state.pot += cost;
        state.players = np;
        state.rBets = nRB;
        state.hc = nHC;
        state.curBet = actual;
        if (isAI) state.ai = nAI;
        
        if (ra2 >= state.lr) {
            state.lr = ra2;
            state.lfb = actual;
        }
        
        const nba = state.ba === "Bet" ? "Raise" : "Re-raise";
        state.ba = nba;
        state.rChain = [...state.rChain, actual];
        state.lastBetInfo = { name: state.players[i].name, label: makeBetLabel(state.raiseCount) };
        state.raiseCount++;
        addLog(state, state.players[i].name + " " + state.lastBetInfo.label + "s" + (state.rChain.length > 1 ? " to " : " ") + chainStr(state.rChain) + (isAI ? " (ALL IN)" : ""));

        const nq = [];
        const n = np.length;
        for (let k = 1; k < n; k++) {
            const ni = (i + k) % n;
            if (!np[ni].folded && np[ni].stack > 0) nq.push(ni);
        }
        advance(state, nq, np, state.phase, nHC, nAI, nRB);
        
    } else if (action === 'allin') {
        const i = actI;
        const ac = state.players[i].stack;
        if (!ac) return false;
        
        const prev = state.rBets[i] || 0;
        const actual = prev + ac;
        
        const np = state.players.map((p, j) => j === i ? { ...p, stack: 0 } : p);
        const nRB = { ...state.rBets, [i]: actual };
        const nHC = { ...state.hc, [state.players[i].id]: (state.hc[state.players[i].id] || 0) + ac };
        const nAI = [...state.ai, state.players[i].id];
        
        addAct(state, state.players[i].id, "allin", ac);
        state.pot += ac;
        state.players = np;
        state.rBets = nRB;
        state.hc = nHC;
        state.ai = nAI;
        
        if (actual > state.curBet) {
            const r2 = actual - state.curBet;
            state.curBet = actual;
            if (r2 >= state.lr) {
                state.lr = r2;
                state.lfb = actual;
            }
            state.ba = state.ba === "Bet" ? "Raise" : "Re-raise";
            state.rChain = [...state.rChain, actual];
            state.lastBetInfo = { name: state.players[i].name, label: makeBetLabel(state.raiseCount) };
            state.raiseCount++;
            addLog(state, state.players[i].name + " " + state.lastBetInfo.label + "s" + (state.rChain.length > 1 ? " to " : " ") + chainStr(state.rChain) + " (ALL IN)");

            const nq = [];
            const n = np.length;
            for (let k = 1; k < n; k++) {
                const ni = (i + k) % n;
                if (!np[ni].folded && np[ni].stack > 0) nq.push(ni);
            }
            advance(state, nq, np, state.phase, nHC, nAI, nRB);
        } else {
            addLog(state, state.players[i].name + " calls $" + ac + (state.lastBetInfo ? " (" + state.lastBetInfo.name + "'s " + state.lastBetInfo.label + ")" : "") + " (ALL IN)");
            advance(state, state.queue.slice(1).filter(j => !np[j].folded && np[j].stack > 0), np, state.phase, nHC, nAI, nRB);
        }
    } else if (action === 'reveal') {
        const bp = state.phase === 'preflop_start' ? 'preflop' : state.phase.replace("_reveal", "");
        
        if (bp !== "preflop") {
            state.rBets = {};
            state.curBet = 0;
            state.ba = "Bet";
            state.raiseCount = 0;
            state.rChain = [];
            state.lastBetInfo = null;
            if (state.cfg) {
                state.lr = state.cfg.bb;
                state.lfb = 0;
            }
        } else {
            // Pre-flop: Blinds are already in rBets from startHand
            state.ba = "Raise";
            state.raiseCount = 1;
            state.rChain = [state.cfg.bb];
            state.lastBetInfo = null;
        }
        
        state.phase = bp;
        const n = state.players.length;
        const q = [];
        
        if (bp === "preflop") {
            // Pre-flop: Action starts left of BB (UTG)
            // Heads-up: Dealer acts first. 3+ players: Left of BB.
            let firstI;
            if (n === 2 || state.players.filter(p => !p.inactive && p.stack > 0).length === 2) {
                firstI = state.dealer;
            } else {
                // Find first active player left of BB
                const startFrom = state.bbI !== undefined ? state.bbI : (state.dealer + 2) % n;
                for (let k = 1; k <= n; k++) {
                    const idx = (startFrom + k) % n;
                    if (!state.players[idx].inactive && state.players[idx].stack > 0) {
                        firstI = idx;
                        break;
                    }
                }
            }

            for (let k = 0; k < n; k++) {
                const idx = (firstI + k) % n;
                const p = state.players[idx];
                if (p && !p.folded && p.stack > 0 && !p.inactive) q.push(idx);
            }
        } else {
            // Post-flop: Action starts left of Dealer (SB)
            let firstI;
            for (let k = 1; k <= n; k++) {
                const idx = (state.dealer + k) % n;
                if (!state.players[idx].inactive && state.players[idx].stack > 0) {
                    firstI = idx;
                    break;
                }
            }
            for (let k = 0; k < n; k++) {
                const idx = (firstI + k) % n;
                const p = state.players[idx];
                if (p && !p.folded && p.stack > 0 && !p.inactive) q.push(idx);
            }
        }

        if (q.length > 1) {
            state.queue = q;
            addLog(state, state.players[q[0]].name + " — first to act");
        } else if (q.length === 1 && bp === "preflop") {
            state.queue = q;
            addLog(state, state.players[q[0]].name + " — your option");
        } else {
            state.queue = [];
            advance(state, [], state.players, bp, state.hc, state.ai, {});
        }
    } else if (action === 'award_win') {
        // Award current pot only, pause for confirmation
        const c2 = state.cp[state.pi];
        if (!c2) return;
        const wid = actionObj.wid;
        const hr = actionObj.hr;
        const np = state.players.map(p => p.id === wid ? { ...p, stack: p.stack + c2.amount } : p);
        const wp = state.players.find(p => p.id === wid);
        const wname = wp ? wp.name : "";
        addLog(state, wname + " wins " + c2.label + ": " + c2.amount + (hr ? " [" + hr + "]" : ""));
        state.players = np;
        state.wi = { name: wname, amt: c2.amount, hr: hr || null };
        state.potAward = { name: wname, amt: c2.amount, hr: hr || null, label: c2.label, eligibleIds: c2.eligible.map(e => e.id) };
        state.confirmations = [];
    } else if (action === 'split_win') {
        const c2 = state.cp[state.pi];
        if (!c2) return;
        const elig = actionObj.elig;
        const amount = c2.amount;
        const share = Math.floor(amount / elig.length);
        const rem = amount % elig.length;
        const np = state.players.map(p => {
            const idx = elig.findIndex(e => e.id === p.id);
            if (idx < 0) return p;
            return { ...p, stack: p.stack + share + (idx < rem ? 1 : 0) };
        });
        const names = elig.map(e => e.name).join(" & ");
        addLog(state, "Split " + amount + " → " + names);
        state.players = np;
        state.wi = { name: "Split: " + names, amt: amount, hr: null };
        state.potAward = { name: "Split: " + names, amt: amount, hr: null, label: c2.label, eligibleIds: c2.eligible.map(e => e.id) };
        state.confirmations = [];
    } else if (action === 'next_pot') {
        state.potAward = null;
        state.confirmations = [];
        let ci = state.pi - 1;
        while (ci >= 0) {
            const c2 = state.cp[ci];
            if (!c2.eligible.length) {
                addLog(state, c2.label + " → bank");
                ci--;
            } else if (c2.eligible.length === 1) {
                const w = c2.eligible[0];
                state.players = state.players.map(p => p.id === w.id ? { ...p, stack: p.stack + c2.amount } : p);
                addLog(state, w.name + " auto-wins " + c2.label + ": " + c2.amount);
                ci--;
            } else {
                break;
            }
        }
        if (ci < 0) {
            state.pot = 0;
            state.pi = 0;
            if (!checkBankruptcy(state, state.players, state.scores)) {
                state.phase = "end";
            }
        } else {
            state.pi = ci;
        }
    } else if (action === 'next_hand') {
        startHand(state);
    } else if (action === 'next_session') {
        state.sn++;
        state.players = state.players.map(p => ({ ...p, stack: state.origSt[p.id] || 0 }));
        startHand(state);
    }

    return true;
}

function checkBankruptcy(state, np, sc) {
    if (!np.some(p => p.stack === 0)) return false;
    const sorted = np.slice().sort((a,b) => b.stack - a.stack);
    const pts = calcSPts(sorted);
    const ns = { ...sc };
    sorted.forEach(p => { ns[p.id] = (ns[p.id] || 0) + (pts[p.id] || 0); });
    
    state.scores = ns;
    state.sei = { rankings: sorted, pts, ns };
    state.phase = "session_end";
    return true;
}

function awardFinal(state, wi2, pls, p) {
    const base = pls || state.players;
    const np = base.map((pl, i) => i === wi2 ? { ...pl, stack: pl.stack + p } : pl);
    state.players = np;
    state.pot = 0;
    state.queue = [];
    state.wi = { name: np[wi2].name, amt: p };
    addLog(state, np[wi2].name + " wins " + p + "!");
    if (!checkBankruptcy(state, np, state.scores)) {
        state.phase = "end";
    }
}

// Ensure showdown processing also uses state correctly
function finalWin(state, wid, hr) {
    const c2 = state.cp[state.pi];
    if (!c2) return;
    const np = state.players.map(p => p.id === wid ? { ...p, stack: p.stack + c2.amount } : p);
    const wp = state.players.find(p => p.id === wid);
    const wname = wp ? wp.name : "";
    addLog(state, wname + " wins " + c2.label + ": " + c2.amount + (hr ? " [" + hr + "]" : ""));
    runRem(state, state.pi - 1, np, wname, c2.amount, hr);
}

function finalSplit(state, elig, amount) {
    const share = Math.floor(amount / elig.length);
    const rem = amount % elig.length;
    const np = state.players.map(p => {
        const idx = elig.findIndex(e => e.id === p.id);
        if (idx < 0) return p;
        return { ...p, stack: p.stack + share + (idx < rem ? 1 : 0) };
    });
    addLog(state, "Split " + amount + " → " + elig.map(e => e.name).join(" & "));
    runRem(state, state.pi - 1, np, "Split", amount);
}

function runRem(state, idx, pls, fw, fa, fhr) {
    let cur = pls, ci = idx;
    while (ci >= 0) {
        const c2 = state.cp[ci];
        if (!c2.eligible.length) {
            addLog(state, c2.label + " → bank");
            ci--;
        } else if (c2.eligible.length === 1) {
            const w = c2.eligible[0];
            cur = cur.map(p => p.id === w.id ? { ...p, stack: p.stack + c2.amount } : p);
            addLog(state, w.name + " gets " + c2.label + ": " + c2.amount);
            ci--;
        } else {
            break;
        }
    }
    state.players = cur;
    state.pot = 0;
    if (ci < 0) {
        state.wi = { name: fw, amt: fa, hr: fhr || null };
        if (!checkBankruptcy(state, cur, state.scores)) {
            state.phase = "end";
        }
        state.pi = 0;
    } else {
        state.pi = ci;
    }
}

// Start Hand
function startHand(state) {
    const pls = state.players;
    const n = pls.length;
    const c = state.cfg;

    // Safety: need at least 2 active players to deal a hand
    if (pls.filter(p => !p.inactive && p.stack > 0).length < 2) return;

    // Find next active dealer
    let dI = state.dealer;
    for (let i = 1; i <= n; i++) {
        const next = (dI + i) % n;
        if (!pls[next].inactive && pls[next].stack > 0) {
            dI = next;
            break;
        }
    }
    state.dealer = dI;
    
    let si, bi;
    const activeIndices = [];
    for (let i = 1; i < n; i++) {
        const idx = (dI + i) % n;
        if (!pls[idx].inactive && pls[idx].stack > 0) activeIndices.push(idx);
    }

    if (n === 2 || (activeIndices.length + 1) === 2) {
        // Heads-up: Dealer is SB, other is BB
        si = dI;
        bi = activeIndices[0];
    } else {
        si = activeIndices[0];
        bi = activeIndices[1];
    }
    
    state.stacksBefore = {};
    pls.forEach(p => { state.stacksBefore[p.id] = p.stack; });

    const sa = Math.min(c.sb, pls[si] ? pls[si].stack : 0);
    const ba2 = Math.min(c.bb, pls[bi] ? pls[bi].stack : 0);
    
    const np = pls.map((p, i) => ({ 
        ...p, 
        folded: p.inactive || p.stack === 0, 
        stack: p.stack - (i === si ? sa : i === bi ? ba2 : 0) 
    }));
    
    // Initial queue for Pre-flop reveal (will be re-calculated in 'reveal')
    // We just need to know who the blinds are for logging
    state.players = np;
    state.sbI = si;
    state.bbI = bi;
    state.pot = sa + ba2;
    state.curBet = ba2;
    state.lr = c.bb;
    state.lfb = c.bb;
    state.rBets = { [si]: sa, [bi]: ba2 };
    state.queue = []; // Wait for 'reveal'
    state.phase = "preflop_start";
    state.hn++;
    state.wi = null;
    state.hc = { [pls[si].id]: sa, [pls[bi].id]: ba2 };
    state.ai = [];
    if (np[si] && np[si].stack === 0) state.ai.push(np[si].id);
    if (np[bi] && np[bi].stack === 0) state.ai.push(np[bi].id);
    
    state.cp = [];
    state.pi = 0;
    state.curActs = [];
    state.ba = "Raise";
    state.raiseCount = 1;
    state.rChain = [c.bb];
    state.lastBetInfo = null;

    state.log = [
        "BB: " + (pls[bi] ? pls[bi].name : "None") + " (" + ba2 + ")", 
        "SB: " + (pls[si] ? pls[si].name : "None") + " (" + sa + ")", 
        "Dealer: " + pls[dI].name, 
        "─ Hand #" + state.hn + " | Sess " + state.sn + "/" + c.sessions + " ─"
    ];
}

function restartGame(state) {
    state.sn = 1;
    state.hn = 0;
    state.scores = {};
    state.history = [];
    state.confirmations = [];

    state.players = state.players.map(p => ({
        ...p,
        stack: state.origSt[p.id] || 0,
        folded: false
    }));

    // First active (non-inactive, stack > 0) player becomes dealer
    const firstActive = state.players.findIndex(p => !p.inactive && p.stack > 0);
    state.dealer = firstActive >= 0 ? firstActive : 0;

    state.restartApprovals = [];
    state.restartHostConfirming = false;
    state.restartCountdown = null;
    state.lastLeaver = null;

    startHand(state);
}

module.exports = {
    processAction,
    startHand,
    finalWin,
    finalSplit,
    restartGame
};
