import { store } from '../store.js';

export function renderSetup(state) {
    const container = document.createElement('div');
    container.className = 'setup-screen';
    
    // Some inline styles for the setup layout
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
            <div id="players-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <!-- Generated dynamically -->
            </div>
        </div>

        <button id="btn-start" class="btn btn-primary" style="margin-top: 1rem; font-size: 1.25rem; padding: 1.25rem;">
            Start Game
        </button>
    `;

    // Setup logic after appending to DOM (simulated here)
    setTimeout(() => {
        const numPlayersInput = container.querySelector('#num-players');
        const sbInput = container.querySelector('#sb-amount');
        const bbInput = container.querySelector('#bb-amount');
        const playersList = container.querySelector('#players-list');
        const btnStart = container.querySelector('#btn-start');

        const renderPlayersList = () => {
            const currentCount = parseInt(numPlayersInput.value) || 2;
            let players = [...store.state.setup.players];
            
            // Adjust length
            while (players.length < currentCount) {
                players.push({ id: players.length + 1, name: \`Player \${players.length + 1}\`, stack: players[0]?.stack || 1000 });
            }
            if (players.length > currentCount) {
                players = players.slice(0, currentCount);
            }
            
            // Update store silently to avoid re-rendering entire view
            store.state.setup.players = players;

            playersList.innerHTML = players.map((p, i) => `
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <input type="text" class="player-name" data-idx="${i}" value="${p.name}" style="flex: 2; padding: 0.75rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 8px; color: white;">
                    <input type="number" class="player-stack" data-idx="${i}" value="${p.stack}" style="flex: 1; padding: 0.75rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 8px; color: white;">
                </div>
            `).join('');

            // Bind change events
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
                    
                    // Auto-fill logic: if changing Player 1's stack, prompt to update all
                    if (idx === 0) {
                        if (confirm('Update all other players to this starting stack?')) {
                            store.state.setup.players.forEach(p => p.stack = val);
                            renderPlayersList(); // Re-render to show updated values
                        }
                    }
                });
            });
        };

        numPlayersInput.addEventListener('change', (e) => {
            store.state.setup.numPlayers = parseInt(e.target.value);
            renderPlayersList();
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

        btnStart.addEventListener('click', () => {
            store.dispatch('START_GAME');
        });

        // Initial render
        renderPlayersList();
    }, 0);

    return container;
}
