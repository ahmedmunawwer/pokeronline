import { store } from '../store.js';

export function renderTable(state) {
    const container = document.createElement('div');
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    // 1. Poker Table Area
    const tableArea = document.createElement('div');
    tableArea.style.flex = '1';
    tableArea.style.position = 'relative';
    tableArea.style.padding = '2rem';
    
    tableArea.innerHTML = `
        <div class="poker-table-bg">
            <div id="community-cards" style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
                <!-- Cards injected here -->
            </div>
            <div style="text-align: center;">
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); text-transform: uppercase;">Main Pot</div>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--gold);">$${state.game.handState.pot}</div>
            </div>
        </div>
        <div id="players-container" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;">
            <!-- Avatars injected here -->
        </div>
    `;

    // 2. Action Bar (Bottom)
    const actionBar = document.createElement('div');
    actionBar.style.padding = '1rem';
    actionBar.style.background = 'var(--surface-color)';
    actionBar.style.borderTop = '1px solid var(--border-color)';
    actionBar.style.display = 'flex';
    actionBar.style.gap = '0.5rem';
    actionBar.style.zIndex = '100';

    // Determine current player
    const currentPlayer = state.game.players[state.game.handState.turnIndex];
    const currentBetToCall = state.game.handState.currentBet - (currentPlayer ? currentPlayer.bet : 0);
    
    // Dynamic text logic
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

    // Setup logic after DOM attach
    setTimeout(() => {
        const playersContainer = container.querySelector('#players-container');
        
        // Render Players around ellipse
        const numPlayers = state.game.players.length;
        const width = playersContainer.clientWidth;
        const height = playersContainer.clientHeight;
        const rx = width / 2.5; // X radius
        const ry = height / 3;  // Y radius
        const cx = width / 2;
        const cy = height / 2;

        playersContainer.innerHTML = state.game.players.map((p, i) => {
            // Calculate position
            const angle = (i / numPlayers) * 2 * Math.PI - Math.PI / 2; // Start from top (-90deg)
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

        // Action Bindings
        container.querySelector('#btn-fold').addEventListener('click', () => {
            store.dispatch('ACTION_FOLD');
        });

        container.querySelector('#btn-check-call').addEventListener('click', () => {
            store.dispatch('ACTION_CHECK_CALL');
        });

        container.querySelector('#btn-bet').addEventListener('click', () => {
            // Open bet modal
            renderBetModal(state, currentBetToCall);
        });

    }, 0);

    return container;
}

function renderBetModal(state, minCallAmount) {
    const modalContainer = document.getElementById('bet-modal');
    const sheetContent = modalContainer.querySelector('.sheet-content');
    
    // Custom Bet UI with +BB logic
    const bb = state.setup.bb;
    let currentInput = minCallAmount + bb; // Minimum raise is usually minCall + BB
    
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

    // Logic
    const display = sheetContent.querySelector('#bet-display');
    const slider = sheetContent.querySelector('#bet-slider');
    const btnAddBb = sheetContent.querySelector('#btn-add-bb');
    const dynamicContainer = sheetContent.querySelector('#dynamic-btn-container');

    const updateDisplay = (val) => {
        currentInput = val;
        display.textContent = val;
        slider.value = val;
    };

    slider.addEventListener('input', (e) => {
        updateDisplay(parseInt(e.target.value));
    });

    btnAddBb.addEventListener('click', () => {
        updateDisplay(currentInput + bb);
        
        // Split logic: first click splits into +BB/2 and +BB
        dynamicContainer.innerHTML = `
            <button id="btn-add-half-bb" class="btn" style="flex: 1;">+$${bb/2}</button>
            <button id="btn-add-bb-split" class="btn" style="flex: 1;">+$${bb} (BB)</button>
        `;
        
        dynamicContainer.querySelector('#btn-add-half-bb').addEventListener('click', () => {
            updateDisplay(currentInput + (bb/2));
        });
        
        dynamicContainer.querySelector('#btn-add-bb-split').addEventListener('click', () => {
            updateDisplay(currentInput + bb);
        });
    });

    sheetContent.querySelector('#btn-cancel-bet').addEventListener('click', () => {
        modalContainer.classList.add('hidden');
    });

    sheetContent.querySelector('#btn-confirm-bet').addEventListener('click', () => {
        store.dispatch('ACTION_BET', { amount: currentInput });
        modalContainer.classList.add('hidden');
    });
}
