import { store } from './store.js';
import { renderSetup } from './ui/setup.js';
import { renderTable } from './ui/table.js';
import { renderShowdown } from './ui/showdown.js';
import { renderSessionEnd } from './ui/session_end.js';
import { renderGameOver } from './ui/game_over.js';
import { icons } from './ui/icons.js';

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
        // Setup icons
        this.btnUndo.innerHTML = icons.undo;
        this.btnGlobalStats.innerHTML = icons.barChart;
        document.getElementById('btn-menu').innerHTML = icons.menu;

        // Bind events
        this.btnUndo.addEventListener('click', () => store.undo());
        
        // Subscribe to state changes
        store.subscribe((state) => this.render(state));
        
        // Initial render
        this.render(store.state);
    }

    render(state) {
        // Handle Top Navigation Visibility
        if (state.screen === 'setup') {
            this.topBar.classList.add('hidden');
            this.btnGlobalStats.classList.add('hidden');
        } else {
            this.topBar.classList.remove('hidden');
            this.btnGlobalStats.classList.remove('hidden');
            this.potDisplay.textContent = `$${state.game.handState.pot}`;
        }

        // Render specific screen
        this.mainContent.innerHTML = ''; // Clear current
        
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

// Start app
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
