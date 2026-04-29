// --- ICONS ---
const icons = {
    undo: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
    menu: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
    barChart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`,
    plus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    minus: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
    crown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>`
};

// --- STORE ---
const STORAGE_KEY = 'poker_tracker_state';

const clone = (obj) => JSON.parse(JSON.stringify(obj));

const initialState = {
    screen: 'setup',
    setup: {
        numPlayers: 4,
        totalSessions: 1,
        sb: 10,
        bb: 20,
        players: [
            { id: 1, name: 'Player 1', stack: 1000 },
            { id: 2, name: 'Player 2', stack: 1000 },
            { id: 3, name: 'Player 3', stack: 1000 },
            { id: 4, name: 'Player 4', stack: 1000 }
        ]
    },
    game: {
        currentSession: 1,
        isGameOver: false,
        players: [],
        dealerIndex: 0,
        sbIndex: 1,
        bbIndex: 2,
        handCount: 0,
        handState: {
            phase: 'pre-flop',
            pot: 0,
            sidePots: [],
            currentBet: 0,
            turnIndex: 0,
            lastAggressorIndex: null,
            playersFolded: 0
        },
        globalStats: { points: {} }
    }
};

class Store {
    constructor() {
        this.listeners = [];
        this.history = [];
        this.loadState();
    }

    loadState() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                this.state = JSON.parse(saved);
            } catch (e) {
                this.state = clone(initialState);
            }
        } else {
            this.state = clone(initialState);
        }
    }

    saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.saveState();
        this.listeners.forEach(listener => listener(this.state));
    }

    commit() {
        this.history.push(clone(this.state));
        if (this.history.length > 50) this.history.shift();
    }

    undo() {
        if (this.history.length > 0) {
            this.state = this.history.pop();
            this.notify();
        }
    }

    dispatch(actionType, payload) {
        this.commit();
        
        switch (actionType) {
            case 'UPDATE_SETUP':
                this.state.setup = { ...this.state.setup, ...payload };
                break;
            case 'START_GAME':
                this.state.screen = 'table';
                this.state.game.players = this.state.setup.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    chips: p.stack,
                    bet: 0,
                    status: 'active',
                    rank: null
                }));
                this.state.game.dealerIndex = 0;
                this._startNewHand();
                break;
            case 'NAVIGATE':
                this.state.screen = payload;
                break;
            case 'ACTION_FOLD':
                this._handleFold();
                break;
            case 'ACTION_CHECK_CALL':
                this._handleCheckCall();
                break;
            case 'ACTION_BET':
                this._handleBet(payload.amount);
                break;
            case 'NEXT_PHASE':
                this._advancePhase();
                break;
            case 'RESOLVE_SHOWDOWN':
                this._resolveShowdown(payload.winnerIds, payload.handType);
                break;
            case 'END_SESSION':
                this._endSession(payload.pointsTable);
                break;
        }
        
        this.notify();
    }

    _startNewHand() {
        const game = this.state.game;
        const numActive = game.players.filter(p => p.status !== 'bankrupt').length;
        
        game.dealerIndex = this._nextActivePlayerIndex(game.dealerIndex);
        
        if (numActive === 2) {
            game.sbIndex = game.dealerIndex;
            game.bbIndex = this._nextActivePlayerIndex(game.dealerIndex);
        } else {
            game.sbIndex = this._nextActivePlayerIndex(game.dealerIndex);
            game.bbIndex = this._nextActivePlayerIndex(game.sbIndex);
        }

        game.handState = {
            phase: 'pre-flop',
            pot: 0,
            sidePots: [],
            currentBet: this.state.setup.bb,
            turnIndex: this._nextActivePlayerIndex(game.bbIndex),
            lastAggressorIndex: null,
            playersFolded: 0
        };

        game.players.forEach((p, idx) => {
            if (p.status !== 'bankrupt') p.status = 'active';
            p.bet = 0;
            
            if (idx === game.sbIndex && p.status === 'active') {
                const amount = Math.min(p.chips, this.state.setup.sb);
                p.chips -= amount;
                p.bet = amount;
            }
            if (idx === game.bbIndex && p.status === 'active') {
                const amount = Math.min(p.chips, this.state.setup.bb);
                p.chips -= amount;
                p.bet = amount;
            }
        });
    }

    _nextActivePlayerIndex(currentIndex) {
        let idx = (currentIndex + 1) % this.state.game.players.length;
        let loopCount = 0;
        const total = this.state.game.players.length;
        while ((this.state.game.players[idx].status === 'bankrupt' || this.state.game.players[idx].status === 'folded' || this.state.game.players[idx].status === 'all-in') && loopCount < total) {
            idx = (idx + 1) % total;
            loopCount++;
        }
        return idx;
    }

    _handleFold() {
        const game = this.state.game;
        const p = game.players[game.handState.turnIndex];
        p.status = 'folded';
        game.handState.playersFolded++;
        
        const activePlayers = game.players.filter(pl => pl.status === 'active' || pl.status === 'all-in');
        if (activePlayers.length === 1) {
            this._awardPotToSingleWinner(activePlayers[0]);
            return;
        }
        this._advanceTurn();
    }

    _handleCheckCall() {
        const game = this.state.game;
        const p = game.players[game.handState.turnIndex];
        const callAmount = game.handState.currentBet - p.bet;
        
        const actualCall = Math.min(callAmount, p.chips);
        p.chips -= actualCall;
        p.bet += actualCall;
        
        if (p.chips === 0) p.status = 'all-in';
        
        this._advanceTurn();
    }

    _handleBet(amount) {
        const game = this.state.game;
        const p = game.players[game.handState.turnIndex];
        
        const additionalAmount = amount - p.bet;
        const actualBet = Math.min(additionalAmount, p.chips);
        
        p.chips -= actualBet;
        p.bet += actualBet;
        
        if (p.chips === 0) p.status = 'all-in';
        
        game.handState.currentBet = p.bet;
        game.handState.lastAggressorIndex = game.handState.turnIndex;
        
        this._advanceTurn();
    }

    _advanceTurn() {
        const game = this.state.game;
        const nextIdx = this._nextActivePlayerIndex(game.handState.turnIndex);
        
        const allActiveHaveActed = game.players.every(p => 
            p.status !== 'active' || p.bet === game.handState.currentBet
        );
        
        const isPreFlopBBCheck = game.handState.phase === 'pre-flop' && 
                                 nextIdx === game.bbIndex && 
                                 game.handState.currentBet === this.state.setup.bb &&
                                 game.handState.lastAggressorIndex === null;

        if (allActiveHaveActed && !isPreFlopBBCheck) {
            this._advancePhase();
        } else {
            game.handState.turnIndex = nextIdx;
        }
    }

    _advancePhase() {
        const game = this.state.game;
        game.players.forEach(p => {
            game.handState.pot += p.bet;
            p.bet = 0;
        });
        game.handState.currentBet = 0;
        game.handState.lastAggressorIndex = null;

        const phases = ['pre-flop', 'flop', 'turn', 'river', 'showdown'];
        const currentIdx = phases.indexOf(game.handState.phase);
        
        if (currentIdx === phases.length - 1) {
            this.state.screen = 'showdown';
        } else {
            game.handState.phase = phases[currentIdx + 1];
            game.handState.turnIndex = this._nextActivePlayerIndex(game.dealerIndex);
        }
    }

    _awardPotToSingleWinner(winner) {
        const game = this.state.game;
        game.players.forEach(p => {
            game.handState.pot += p.bet;
            p.bet = 0;
        });
        winner.chips += game.handState.pot;
        game.handState.pot = 0;
        
        this._checkSessionEndOrNextHand();
    }

    _resolveShowdown(winnerIds, handType) {
        const game = this.state.game;
        game.players.forEach(p => {
            game.handState.pot += p.bet;
            p.bet = 0;
        });

        const splitAmount = Math.floor(game.handState.pot / winnerIds.length);
        const remainder = game.handState.pot % winnerIds.length;

        game.players.forEach(p => {
            if (winnerIds.includes(p.id)) {
                p.chips += splitAmount;
            }
        });
        
        if (remainder > 0 && winnerIds.length > 0) {
            const firstWinner = game.players.find(p => p.id === winnerIds[0]);
            if (firstWinner) firstWinner.chips += remainder;
        }

        game.handState.pot = 0;
        this._checkSessionEndOrNextHand();
    }

    _checkSessionEndOrNextHand() {
        const game = this.state.game;
        const bankruptPlayer = game.players.find(p => p.chips === 0);
        if (bankruptPlayer) {
            this.state.screen = 'session_end';
        } else {
            this._startNewHand();
            this.state.screen = 'table';
        }
    }

    _endSession(pointsTable) {
        const game = this.state.game;
        
        if (!game.globalStats.points) game.globalStats.points = {};
        pointsTable.forEach(p => {
            if (!game.globalStats.points[p.id]) game.globalStats.points[p.id] = { name: p.name, total: 0 };
            game.globalStats.points[p.id].total += p.points;
        });

        if (game.currentSession >= this.state.setup.totalSessions) {
            this.state.screen = 'game_over';
        } else {
            game.currentSession++;
            game.players.forEach(p => {
                const setupPlayer = this.state.setup.players.find(sp => sp.id === p.id);
                p.chips = setupPlayer ? setupPlayer.stack : 1000;
                p.status = 'active';
            });
            this._startNewHand();
            this.state.screen = 'table';
        }
    }
}

const store = new Store();

// --- UI COMPONENTS ---
function renderSetup(state) {
    const container = document.createElement('div');
    container.className = 'setup-screen';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '2rem';
    container.style.padding = '1rem';
    container.style.maxWidth = '500px';
    container.style.margin = '0 auto';

    container.innerHTML = `
        <h1 style="text-align: center; color: var(--gold); font-family: var(--font-serif); margin-bottom: 1rem;">
            Texas Hold'em Tracker
        </h1>
        
        <div class="card" style="background: var(--surface-color); padding: 1.5rem; border-radius: 16px; border: 1px solid var(--border-color);">
            <h2 style="margin-bottom: 1rem; font-size: 1.25rem;">Game Settings</h2>
            
            <div class="input-group">
                <label>Number of Players</label>
                <input type="number" id="num-players" value="${state.setup.numPlayers}" min="2" max="10">
            </div>
            
            <div class="input-group">
                <label>Total Sessions</label>
                <input type="number" id="total-sessions" value="${state.setup.totalSessions}" min="1">
            </div>
            
            <div style="display: flex; gap: 1rem;">
                <div class="input-group" style="flex: 1;">
                    <label>Small Blind (SB)</label>
                    <input type="number" id="sb-amount" value="${state.setup.sb}" min="1">
                </div>
                <div class="input-group" style="flex: 1;">
                    <label>Big Blind (BB)</label>
                    <input type="number" id="bb-amount" value="${state.setup.bb}" min="2">
                </div>
            </div>
        </div>

        <div class="card" style="background: var(--surface-color); padding: 1.5rem; border-radius: 16px; border: 1px solid var(--border-color);">
            <h2 style="margin-bottom: 1rem; font-size: 1.25rem;">Players</h2>
            <div id="players-list" style="display: flex; flex-direction: column; gap: 0.5rem;"></div>
        </div>

        <button id="btn-start" class="btn btn-primary" style="margin-top: 1rem; font-size: 1.25rem; padding: 1.25rem;">
            Start Game
        </button>
    `;

    setTimeout(() => {
        const numPlayersInput = container.querySelector('#num-players');
        const totalSessionsInput = container.querySelector('#total-sessions');
        const sbInput = container.querySelector('#sb-amount');
        const bbInput = container.querySelector('#bb-amount');
        const playersList = container.querySelector('#players-list');
        const btnStart = container.querySelector('#btn-start');

        const renderPlayersList = () => {
            const currentCount = parseInt(numPlayersInput.value) || 2;
            let players = [...store.state.setup.players];
            
            while (players.length < currentCount) {
                players.push({ id: players.length + 1, name: `Player ${players.length + 1}`, stack: players[0]?.stack || 1000 });
            }
            if (players.length > currentCount) {
                players = players.slice(0, currentCount);
            }
            
            store.state.setup.players = players;

            playersList.innerHTML = players.map((p, i) => `
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input type="text" class="player-name" data-idx="${i}" value="${p.name}" style="flex: 2; padding: 0.75rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 8px; color: white;">
                    <input type="number" class="player-stack" data-idx="${i}" value="${p.stack}" style="flex: 1; padding: 0.75rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 8px; color: white;">
                </div>
            `).join('');

            playersList.querySelectorAll('.player-name').forEach(input => {
                input.addEventListener('change', (e) => {
                    const idx = e.target.dataset.idx;
                    store.state.setup.players[idx].name = e.target.value;
                });
            });

            playersList.querySelectorAll('.player-stack').forEach(input => {
                input.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    const val = parseInt(e.target.value);
                    store.state.setup.players[idx].stack = val;
                    
                    if (idx === 0) {
                        if (confirm('Update all other players to this starting stack?')) {
                            store.state.setup.players.forEach(p => p.stack = val);
                            renderPlayersList();
                        }
                    }
                });
            });
        };

        numPlayersInput.addEventListener('change', (e) => {
            store.state.setup.numPlayers = parseInt(e.target.value);
            renderPlayersList();
        });

        totalSessionsInput.addEventListener('change', (e) => {
            store.state.setup.totalSessions = parseInt(e.target.value) || 1;
        });

        sbInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            store.state.setup.sb = val;
            store.state.setup.bb = val * 2;
            bbInput.value = val * 2;
        });

        bbInput.addEventListener('change', (e) => {
            store.state.setup.bb = parseInt(e.target.value);
        });

        btnStart.addEventListener('click', () => store.dispatch('START_GAME'));

        renderPlayersList();
    }, 0);

    return container;
}

function renderTable(state) {
    const container = document.createElement('div');
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const tableArea = document.createElement('div');
    tableArea.style.flex = '1';
    tableArea.style.position = 'relative';
    tableArea.style.padding = '2rem';
    
    tableArea.innerHTML = `
        <div class="poker-table-bg">
            <div id="community-cards" style="display: flex; gap: 0.5rem; margin-bottom: 1rem;"></div>
            <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); text-transform: uppercase;">Main Pot</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--gold);">$${state.game.handState.pot}</div>
            </div>
        </div>
        <div id="players-container" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;"></div>
    `;

    const actionBar = document.createElement('div');
    actionBar.style.padding = '1rem';
    actionBar.style.background = 'var(--surface-color)';
    actionBar.style.borderTop = '1px solid var(--border-color)';
    actionBar.style.display = 'flex';
    actionBar.style.gap = '0.5rem';
    actionBar.style.zIndex = '100';

    const currentPlayer = state.game.players[state.game.handState.turnIndex];
    const currentBetToCall = state.game.handState.currentBet - (currentPlayer ? currentPlayer.bet : 0);
    
    const canCheck = currentBetToCall === 0;
    const isFirstBet = state.game.handState.currentBet === 0 || (state.game.handState.phase === 'pre-flop' && state.game.handState.currentBet === state.setup.bb);
    const betText = isFirstBet ? 'Bet/Raise' : 'Raise';

    actionBar.innerHTML = `
        <button id="btn-fold" class="btn btn-danger" style="flex: 1;">Fold</button>
        <button id="btn-check-call" class="btn" style="flex: 1; background: var(--action-check);">${canCheck ? 'Check' : 'Call $' + currentBetToCall}</button>
        <button id="btn-bet" class="btn btn-primary" style="flex: 1;">${betText}</button>
    `;

    container.appendChild(tableArea);
    container.appendChild(actionBar);

    setTimeout(() => {
        const playersContainer = container.querySelector('#players-container');
        const numPlayers = state.game.players.length;
        const width = playersContainer.clientWidth;
        const height = playersContainer.clientHeight;
        const rx = width / 2.5;
        const ry = height / 3;
        const cx = width / 2;
        const cy = height / 2;

        playersContainer.innerHTML = state.game.players.map((p, i) => {
            const angle = (i / numPlayers) * 2 * Math.PI - Math.PI / 2;
            const x = cx + rx * Math.cos(angle);
            const y = cy + ry * Math.sin(angle);
            
            const isTurn = i === state.game.handState.turnIndex;
            const isDealer = i === state.game.dealerIndex;
            const isSB = i === state.game.sbIndex;
            const isBB = i === state.game.bbIndex;
            
            let roleBadge = '';
            if (isDealer) roleBadge += '<span style="background: white; color: black; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; position: absolute; top: -5px; right: -5px;">D</span>';
            if (isSB) roleBadge += '<span style="background: var(--chip-blue); color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; position: absolute; bottom: -5px; left: -5px;">SB</span>';
            if (isBB) roleBadge += '<span style="background: var(--chip-red); color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; position: absolute; bottom: -5px; right: -5px;">BB</span>';

            const opacity = p.status === 'folded' ? '0.5' : '1';
            const highlight = isTurn ? 'box-shadow: 0 0 0 3px var(--gold);' : '';

            return `
                <div style="position: absolute; left: ${x}px; top: ${y}px; transform: translate(-50%, -50%); pointer-events: auto;">
                    <div style="position: relative; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 0.5rem; text-align: center; min-width: 80px; opacity: ${opacity}; ${highlight}">
                        ${roleBadge}
                        <div style="font-size: 0.8rem; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px;">${p.name}</div>
                        <div style="font-size: 0.9rem; color: var(--gold);">$${p.chips}</div>
                    </div>
                    ${p.bet > 0 ? `
                        <div style="position: absolute; ${y > cy ? 'top: -30px;' : 'bottom: -30px;'} left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 10px; font-size: 0.8rem; color: white;">
                            $${p.bet}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        container.querySelector('#btn-fold').addEventListener('click', () => store.dispatch('ACTION_FOLD'));
        container.querySelector('#btn-check-call').addEventListener('click', () => store.dispatch('ACTION_CHECK_CALL'));
        container.querySelector('#btn-bet').addEventListener('click', () => renderBetModal(state, currentBetToCall));

    }, 0);

    return container;
}

function renderBetModal(state, minCallAmount) {
    const modalContainer = document.getElementById('bet-modal');
    const sheetContent = modalContainer.querySelector('.sheet-content');
    
    const bb = state.setup.bb;
    let currentInput = minCallAmount + bb;
    
    sheetContent.innerHTML = `
        <h3 style="margin-bottom: 1rem;">Bet / Raise</h3>
        
        <div style="font-size: 2.5rem; text-align: center; color: var(--gold); margin-bottom: 1rem; font-weight: bold;">
            $<span id="bet-display">${currentInput}</span>
        </div>
        
        <input type="range" id="bet-slider" min="${minCallAmount + bb}" max="${state.game.players[state.game.handState.turnIndex].chips}" value="${currentInput}" style="width: 100%; margin-bottom: 1.5rem;">
        
        <div id="dynamic-btn-container" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem;">
            <button id="btn-add-bb" class="btn" style="flex: 1;">+$${bb} (BB)</button>
        </div>

        <div style="display: flex; gap: 0.5rem;">
            <button id="btn-cancel-bet" class="btn" style="flex: 1;">Cancel</button>
            <button id="btn-confirm-bet" class="btn btn-primary" style="flex: 1;">Confirm Bet</button>
        </div>
    `;

    modalContainer.classList.remove('hidden');

    const display = sheetContent.querySelector('#bet-display');
    const slider = sheetContent.querySelector('#bet-slider');
    const btnAddBb = sheetContent.querySelector('#btn-add-bb');
    const dynamicContainer = sheetContent.querySelector('#dynamic-btn-container');

    const updateDisplay = (val) => {
        currentInput = val;
        display.textContent = val;
        slider.value = val;
    };

    slider.addEventListener('input', (e) => updateDisplay(parseInt(e.target.value)));

    btnAddBb.addEventListener('click', () => {
        updateDisplay(currentInput + bb);
        
        dynamicContainer.innerHTML = `
            <button id="btn-add-half-bb" class="btn" style="flex: 1;">+$${bb/2}</button>
            <button id="btn-add-bb-split" class="btn" style="flex: 1;">+$${bb} (BB)</button>
        `;
        
        dynamicContainer.querySelector('#btn-add-half-bb').addEventListener('click', () => updateDisplay(currentInput + (bb/2)));
        dynamicContainer.querySelector('#btn-add-bb-split').addEventListener('click', () => updateDisplay(currentInput + bb));
    });

    sheetContent.querySelector('#btn-cancel-bet').addEventListener('click', () => modalContainer.classList.add('hidden'));

    sheetContent.querySelector('#btn-confirm-bet').addEventListener('click', () => {
        store.dispatch('ACTION_BET', { amount: currentInput });
        modalContainer.classList.add('hidden');
    });
}

function renderShowdown(state) {
    const container = document.createElement('div');
    container.className = 'showdown-screen';
    container.style.padding = '1rem';
    container.style.maxWidth = '500px';
    container.style.margin = '0 auto';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const activePlayers = state.game.players.filter(p => p.status === 'active' || p.status === 'all-in');
    
    container.innerHTML = `
        <h2 style="text-align: center; color: var(--gold); margin-bottom: 2rem;">Showdown - Pot $${state.game.handState.pot}</h2>
        
        <div class="card" style="background: var(--surface-color); padding: 1.5rem; border-radius: 16px; flex: 1;">
            <h3 style="margin-bottom: 1rem;">Select Winner(s)</h3>
            
            <div id="winner-list" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 2rem;">
                ${activePlayers.map(p => `
                    <label style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid var(--border-color);">
                        <input type="checkbox" class="winner-checkbox" value="${p.id}" style="width: 20px; height: 20px;">
                        <span style="flex: 1; font-size: 1.1rem;">${p.name}</span>
                        <span style="color: var(--gold);">$${p.chips}</span>
                    </label>
                `).join('')}
            </div>

            <h3 style="margin-bottom: 1rem;">Winning Hand</h3>
            <select id="winning-hand" style="width: 100%; padding: 1rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 8px; color: white; margin-bottom: 2rem;">
                <option value="High Card">High Card</option>
                <option value="One Pair">One Pair</option>
                <option value="Two Pair">Two Pair</option>
                <option value="Three of a Kind">Three of a Kind</option>
                <option value="Straight">Straight</option>
                <option value="Flush">Flush</option>
                <option value="Full House">Full House</option>
                <option value="Four of a Kind">Four of a Kind</option>
                <option value="Straight Flush">Straight Flush</option>
                <option value="Royal Flush">Royal Flush</option>
            </select>
        </div>

        <button id="btn-confirm-winners" class="btn btn-primary" style="margin-top: 1rem; padding: 1.25rem;">
            Confirm & Distribute Pot
        </button>
    `;

    setTimeout(() => {
        const btnConfirm = container.querySelector('#btn-confirm-winners');
        btnConfirm.addEventListener('click', () => {
            const checkboxes = container.querySelectorAll('.winner-checkbox:checked');
            if (checkboxes.length === 0) {
                alert('Please select at least one winner.');
                return;
            }
            
            const winnerIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
            const handType = container.querySelector('#winning-hand').value;

            if (confirm(`Confirm transferring ${state.game.handState.pot} to selected winner(s)?`)) {
                store.dispatch('RESOLVE_SHOWDOWN', { winnerIds, handType });
            }
        });
    }, 0);

    return container;
}

function renderSessionEnd(state) {
    const container = document.createElement('div');
    container.className = 'session-end-screen';
    container.style.padding = '1rem';
    container.style.maxWidth = '600px';
    container.style.margin = '0 auto';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const sortedPlayers = [...state.game.players].sort((a, b) => b.chips - a.chips);
    const chipGroups = {};
    sortedPlayers.forEach(p => {
        if (!chipGroups[p.chips]) chipGroups[p.chips] = [];
        chipGroups[p.chips].push(p);
    });
    
    const uniqueChips = Object.keys(chipGroups).map(Number).sort((a, b) => b - a);
    let currentRank = 1;
    let pointsTable = [];
    
    uniqueChips.forEach((chips, index) => {
        const group = chipGroups[chips];
        const isBankrupt = chips === 0;
        const numInGroup = group.length;
        let rankToAssign;
        let pointsToAssign = 0;
        
        if (isBankrupt) {
            rankToAssign = sortedPlayers.length;
            pointsToAssign = 0;
        } else {
            if (index === 0 && numInGroup > 1) {
                rankToAssign = 2;
            } else if (numInGroup > 1) {
                rankToAssign = currentRank + numInGroup - 1;
            } else {
                rankToAssign = currentRank;
            }
            
            const totalPlayers = sortedPlayers.length;
            if (rankToAssign === 1) pointsToAssign = totalPlayers;
            else if (rankToAssign === 2) pointsToAssign = totalPlayers - 2;
            else pointsToAssign = Math.max(0, totalPlayers - rankToAssign);
        }
        
        group.forEach(p => {
            pointsTable.push({ id: p.id, name: p.name, chips: p.chips, rank: rankToAssign, points: pointsToAssign });
        });
        currentRank += numInGroup;
    });

    container.innerHTML = `
        <h2 style="text-align: center; color: var(--gold); margin-bottom: 1rem; font-family: var(--font-serif); font-size: 2.5rem;">
            Session ${state.game.currentSession} Complete!
        </h2>
        
        <div class="card" style="background: var(--surface-color); padding: 1.5rem; border-radius: 16px; flex: 1; overflow-y: auto;">
            <h3 style="margin-bottom: 1rem; text-align: center; color: var(--text-secondary);">Scoreboard</h3>
            
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                ${pointsTable.map(p => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; border-left: 4px solid ${p.rank === 1 ? 'var(--gold)' : p.rank === sortedPlayers.length ? 'var(--blood-red)' : 'var(--border-color)'};">
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            <span style="font-size: 1.5rem; font-weight: bold; color: var(--text-secondary); width: 30px;">#${p.rank}</span>
                            <span style="font-size: 1.25rem; font-weight: 500; ${p.rank === 1 ? 'color: var(--gold);' : ''}">${p.name}</span>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.25rem; font-weight: bold; color: var(--gold);">+${p.points} pts</div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">$${p.chips} remaining</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <button id="btn-next-session" class="btn btn-primary" style="margin-top: 1rem; padding: 1.25rem; font-size: 1.25rem;">
            ${state.game.currentSession >= state.setup.totalSessions ? 'View Final Standings' : 'Start Next Session'}
        </button>
    `;

    setTimeout(() => {
        container.querySelector('#btn-next-session').addEventListener('click', () => {
            store.dispatch('END_SESSION', { pointsTable });
        });
    }, 0);

    return container;
}

function renderGameOver(state) {
    const container = document.createElement('div');
    container.className = 'game-over-screen';
    container.style.padding = '1rem';
    container.style.maxWidth = '600px';
    container.style.margin = '0 auto';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const pointsData = state.game.globalStats?.points || {};
    const finalPlayers = Object.values(pointsData).sort((a, b) => b.total - a.total);
    
    let currentRank = 1;
    let rankIndex = 0;
    while(rankIndex < finalPlayers.length) {
        let tieCount = 1;
        while (rankIndex + tieCount < finalPlayers.length && finalPlayers[rankIndex].total === finalPlayers[rankIndex + tieCount].total) {
            tieCount++;
        }
        
        for (let i = 0; i < tieCount; i++) {
            finalPlayers[rankIndex + i].rank = currentRank;
        }
        currentRank += tieCount;
        rankIndex += tieCount;
    }

    container.innerHTML = `
        <h1 style="text-align: center; color: var(--gold); margin-bottom: 2rem; font-family: var(--font-serif); font-size: 3rem; text-shadow: 0 0 20px rgba(255,193,7,0.5);">
            Game Over
        </h1>
        
        <div class="card" style="background: var(--surface-color); padding: 1.5rem; border-radius: 16px; flex: 1; overflow-y: auto;">
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${finalPlayers.map(p => {
                    let styleClass = '';
                    let iconHtml = '';
                    
                    if (p.rank === 1) {
                        styleClass = 'text-gold';
                        iconHtml = `<span style="color: var(--gold); margin-right: 0.5rem; display: inline-flex;">${icons.crown}</span>`;
                    } else if (p.rank === 2) {
                        styleClass = 'text-silver';
                    } else if (p.rank === 3) {
                        styleClass = 'text-bronze';
                    } else if (p.rank === finalPlayers.length) {
                        styleClass = 'text-blood';
                    }

                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; background: rgba(0,0,0,0.4); border-radius: 12px; border: 1px solid var(--border-color);">
                            <div style="display: flex; align-items: center; font-size: 1.5rem; font-weight: bold; width: 50px; color: var(--text-secondary);">
                                #${p.rank}
                            </div>
                            <div style="flex: 1; font-size: 1.5rem; font-weight: 600;" class="${styleClass}">
                                ${iconHtml}${p.name}
                            </div>
                            <div style="font-size: 1.5rem; font-weight: bold;" class="${styleClass}">
                                ${p.total} pts
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>

        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
            <button id="btn-new-game" class="btn btn-primary" style="flex: 1; padding: 1.25rem;">
                Start New Game
            </button>
        </div>
    `;

    setTimeout(() => {
        container.querySelector('#btn-new-game').addEventListener('click', () => {
            if (confirm('Are you sure you want to start a completely new game? This will reset all scores.')) {
                store.dispatch('NAVIGATE', 'setup');
            }
        });
    }, 0);

    return container;
}

// --- MAIN APP INIT ---
class App {
    constructor() {
        this.appEl = document.getElementById('app');
        this.mainContent = document.getElementById('main-content');
        this.topBar = document.getElementById('top-bar');
        this.potDisplay = document.querySelector('.pot-amount');
        this.btnUndo = document.getElementById('btn-undo');
        this.btnGlobalStats = document.getElementById('btn-global-stats');

        this.init();
    }

    init() {
        this.btnUndo.innerHTML = icons.undo;
        this.btnGlobalStats.innerHTML = icons.barChart;
        document.getElementById('btn-menu').innerHTML = icons.menu;

        this.btnUndo.addEventListener('click', () => store.undo());
        
        this.btnGlobalStats.addEventListener('click', () => {
            showGlobalStatsModal(store.state);
        });
        
        store.subscribe((state) => this.render(state));
        
        this.render(store.state);
    }

    render(state) {
        if (state.screen === 'setup') {
            this.topBar.classList.add('hidden');
            this.btnGlobalStats.classList.add('hidden');
        } else {
            this.topBar.classList.remove('hidden');
            this.btnGlobalStats.classList.remove('hidden');
            this.potDisplay.textContent = `$${state.game.handState.pot}`;
        }

        this.mainContent.innerHTML = '';
        
        switch (state.screen) {
            case 'setup':
                this.mainContent.appendChild(renderSetup(state));
                break;
            case 'table':
                this.mainContent.appendChild(renderTable(state));
                break;
            case 'showdown':
                this.mainContent.appendChild(renderShowdown(state));
                break;
            case 'session_end':
                this.mainContent.appendChild(renderSessionEnd(state));
                break;
            case 'game_over':
                this.mainContent.appendChild(renderGameOver(state));
                break;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
});

function showGlobalStatsModal(state) {
    const modalContainer = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-content');
    
    const pointsData = state.game.globalStats?.points || {};
    const finalPlayers = Object.values(pointsData).sort((a, b) => b.total - a.total);

    modalContent.innerHTML = `
        <h2 style="color: var(--gold); margin-bottom: 1rem; text-align: center;">Global Statistics</h2>
        
        <div style="margin-bottom: 1.5rem; color: var(--text-secondary); text-align: center;">
            Current Session: ${state.game.currentSession} / ${state.setup.totalSessions}<br>
            Total Hands Played: ${state.game.handCount || 0}
        </div>
        
        <h3 style="margin-bottom: 1rem; color: var(--text-primary);">Total Points Accumulation</h3>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem;">
            ${finalPlayers.length > 0 ? finalPlayers.map((p, idx) => `
                <div style="display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(0,0,0,0.3); border-radius: 8px;">
                    <span><span style="color: var(--gold); margin-right: 0.5rem;">#${idx+1}</span>${p.name}</span>
                    <span style="font-weight: bold; color: var(--gold);">${p.total} pts</span>
                </div>
            `).join('') : '<div style="text-align: center; color: var(--text-secondary);">No points recorded yet. Finish a session first!</div>'}
        </div>

        <button id="btn-close-stats" class="btn btn-primary" style="width: 100%; padding: 1rem;">Close</button>
    `;

    modalContainer.classList.remove('hidden');

    modalContent.querySelector('#btn-close-stats').addEventListener('click', () => {
        modalContainer.classList.add('hidden');
    });
}
