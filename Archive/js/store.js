const STORAGE_KEY = 'poker_tracker_state';

// Deep clone helper for history
const clone = (obj) => JSON.parse(JSON.stringify(obj));

const initialState = {
    screen: 'setup', // setup, table, showdown, session_end, game_over
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
        players: [], // Active players with state: {id, name, chips, bet, status: 'active'|'folded'|'all-in'|'bankrupt'}
        dealerIndex: 0,
        sbIndex: 1,
        bbIndex: 2,
        handCount: 0,
        handState: {
            phase: 'pre-flop', // pre-flop, flop, turn, river, showdown
            pot: 0,
            sidePots: [], // { amount, eligiblePlayerIds: [] }
            currentBet: 0,
            turnIndex: 0,
            lastAggressorIndex: null,
            playersFolded: 0
        },
        globalStats: {
            // Stats tracked here
        }
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

    // Push current state to history before mutating
    commit() {
        this.history.push(clone(this.state));
        // Keep max 50 history steps to prevent memory bloat
        if (this.history.length > 50) this.history.shift();
    }

    undo() {
        if (this.history.length > 0) {
            this.state = this.history.pop();
            this.notify();
        }
    }

    // Actions
    dispatch(actionType, payload) {
        this.commit(); // Save state before change
        
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
            // Additional actions will be implemented as needed
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

    // Private helpers
    _startNewHand() {
        const game = this.state.game;
        const numActive = game.players.filter(p => p.status !== 'bankrupt').length;
        
        // Find next valid dealer
        game.dealerIndex = this._nextActivePlayerIndex(game.dealerIndex);
        
        if (numActive === 2) {
            // Heads up logic: Dealer is SB
            game.sbIndex = game.dealerIndex;
            game.bbIndex = this._nextActivePlayerIndex(game.dealerIndex);
        } else {
            game.sbIndex = this._nextActivePlayerIndex(game.dealerIndex);
            game.bbIndex = this._nextActivePlayerIndex(game.sbIndex);
        }

        // Reset hand state
        game.handState = {
            phase: 'pre-flop',
            pot: 0,
            sidePots: [],
            currentBet: this.state.setup.bb,
            turnIndex: this._nextActivePlayerIndex(game.bbIndex), // UTG is next
            lastAggressorIndex: null,
            playersFolded: 0
        };

        // Reset player bets/status for hand
        game.players.forEach((p, idx) => {
            if (p.status !== 'bankrupt') p.status = 'active';
            p.bet = 0;
            
            // Post blinds automatically
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
        
        // Check if only 1 player left (they win the pot)
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
        
        // Amount here is the total new bet they are making (raise to X)
        // Ensure they have enough chips
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
        
        // Check if round is over
        // Round is over if we've reached the last aggressor, or if everyone has acted and we are back to BB (pre-flop)
        const allActiveHaveActed = game.players.every(p => 
            p.status !== 'active' || p.bet === game.handState.currentBet
        );
        
        // Special case: pre-flop BB option to check
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
        // Collect bets into pot
        game.players.forEach(p => {
            game.handState.pot += p.bet;
            p.bet = 0;
        });
        game.handState.currentBet = 0;
        game.handState.lastAggressorIndex = null;

        const phases = ['pre-flop', 'flop', 'turn', 'river', 'showdown'];
        const currentIdx = phases.indexOf(game.handState.phase);
        
        if (currentIdx === phases.length - 1) {
            // End of hand, go to showdown
            this.state.screen = 'showdown'; // Will implement showdown UI
        } else {
            game.handState.phase = phases[currentIdx + 1];
            // First to act is small blind, or next active
            // Let's find first active player after dealer
            game.handState.turnIndex = this._nextActivePlayerIndex(game.dealerIndex);
        }
    }

    _awardPotToSingleWinner(winner) {
        const game = this.state.game;
        // Collect current bets
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
        // Collect any lingering bets
        game.players.forEach(p => {
            game.handState.pot += p.bet;
            p.bet = 0;
        });

        // Split pot among winners
        const splitAmount = Math.floor(game.handState.pot / winnerIds.length);
        const remainder = game.handState.pot % winnerIds.length;

        game.players.forEach(p => {
            if (winnerIds.includes(p.id)) {
                p.chips += splitAmount;
            }
        });
        
        // Give remainder to first player after dealer (standard rule)
        if (remainder > 0 && winnerIds.length > 0) {
            // Simplified: give remainder to first winner in array for now
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
        
        // Accumulate points to globalStats (simplified for now)
        if (!game.globalStats.points) game.globalStats.points = {};
        pointsTable.forEach(p => {
            if (!game.globalStats.points[p.id]) game.globalStats.points[p.id] = { name: p.name, total: 0 };
            game.globalStats.points[p.id].total += p.points;
        });

        if (game.currentSession >= this.state.setup.totalSessions) {
            this.state.screen = 'game_over';
        } else {
            game.currentSession++;
            // Reset players stacks to starting stack
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

export const store = new Store();
