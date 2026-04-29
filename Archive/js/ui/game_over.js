import { store } from '../store.js';
import { icons } from './icons.js';

export function renderGameOver(state) {
    const container = document.createElement('div');
    container.className = 'game-over-screen';
    container.style.padding = '1rem';
    container.style.maxWidth = '600px';
    container.style.margin = '0 auto';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    // Get final points
    const pointsData = state.game.globalStats?.points || {};
    const finalPlayers = Object.values(pointsData).sort((a, b) => b.total - a.total);
    
    // Assign ranks handling ties
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
