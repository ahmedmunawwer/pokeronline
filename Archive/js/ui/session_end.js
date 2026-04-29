import { store } from '../store.js';

export function renderSessionEnd(state) {
    const container = document.createElement('div');
    container.className = 'session-end-screen';
    container.style.padding = '1rem';
    container.style.maxWidth = '600px';
    container.style.margin = '0 auto';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    // Calculate Ranks and Points
    // 1. Sort players by chips descending
    const sortedPlayers = [...state.game.players].sort((a, b) => b.chips - a.chips);
    
    // 2. Assign ranks and points based on rules
    // Rule: Bankrupt = 0 points
    // Subsequent = Previous + 1
    // 1st place = 2nd place + 2
    // Ties share lower potential rank. Top tie shares 2nd.
    
    // Group by chips
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
            rankToAssign = sortedPlayers.length; // Last place
            pointsToAssign = 0;
        } else {
            // Calculate base rank
            if (index === 0 && numInGroup > 1) {
                // Top tie shares 2nd place
                rankToAssign = 2;
            } else if (numInGroup > 1) {
                // Other ties share lower potential rank
                rankToAssign = currentRank + numInGroup - 1;
            } else {
                rankToAssign = currentRank;
            }
            
            // Calculate points: 
            // In a simple point system requested:
            // Bankrupt = 0
            // 4th = 0
            // 3rd = 1
            // 2nd = 2
            // 1st = 4
            const totalPlayers = sortedPlayers.length;
            if (rankToAssign === 1) pointsToAssign = totalPlayers; // Max points
            else if (rankToAssign === 2) pointsToAssign = totalPlayers - 2;
            else pointsToAssign = Math.max(0, totalPlayers - rankToAssign);
        }
        
        group.forEach(p => {
            pointsTable.push({
                id: p.id,
                name: p.name,
                chips: p.chips,
                rank: rankToAssign,
                points: pointsToAssign
            });
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
            // Save global stats logic here
            store.dispatch('END_SESSION', { pointsTable });
        });
    }, 0);

    return container;
}
