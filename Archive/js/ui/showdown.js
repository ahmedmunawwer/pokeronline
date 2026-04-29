import { store } from '../store.js';

export function renderShowdown(state) {
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

            if (confirm(\`Confirm transferring \${state.game.handState.pot} to selected winner(s)?\`)) {
                store.dispatch('RESOLVE_SHOWDOWN', { winnerIds, handType });
            }
        });
    }, 0);

    return container;
}
