const fs = require('fs');
const path = require('path');

const SAVE_DIR = path.join(__dirname, '..', 'saves');

// Ensure saves directory exists
if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
}

function saveGame(gameState, roomPlayers) {
    const saveId = Date.now().toString(36);
    // Clean state for serialization
    const stateCopy = JSON.parse(JSON.stringify(gameState));
    delete stateCopy.confirmations;

    const saveData = {
        saveId,
        savedAt: new Date().toISOString(),
        playerNames: roomPlayers.map(p => p.name),
        playerCount: roomPlayers.length,
        gameState: stateCopy,
        handNumber: gameState.hn,
        sessionNumber: gameState.sn
    };

    const filePath = path.join(SAVE_DIR, `save_${saveId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
    return saveId;
}

function saveAutosave(gameState, roomPlayers) {
    const stateCopy = JSON.parse(JSON.stringify(gameState));
    delete stateCopy.confirmations;

    const saveData = JSON.stringify({
        saveId: 'autosave',
        savedAt: new Date().toISOString(),
        playerNames: roomPlayers.map(p => p.name),
        playerCount: roomPlayers.length,
        gameState: stateCopy,
        handNumber: gameState.hn,
        sessionNumber: gameState.sn
    }, null, 2);

    const filePath = path.join(SAVE_DIR, 'save_autosave.json');
    fs.writeFile(filePath, saveData, (err) => {
        if (err) console.error('[autosave] write failed:', err.message);
    });
}

function listSaves() {
    if (!fs.existsSync(SAVE_DIR)) return [];
    const files = fs.readdirSync(SAVE_DIR).filter(f => f.startsWith('save_') && f.endsWith('.json'));
    return files.map(f => {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'));
            return {
                saveId: data.saveId,
                savedAt: data.savedAt,
                playerNames: data.playerNames,
                playerCount: data.playerCount,
                handNumber: data.handNumber,
                sessionNumber: data.sessionNumber
            };
        } catch (e) {
            return null;
        }
    }).filter(Boolean).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

function loadSave(saveId) {
    const filePath = path.join(SAVE_DIR, `save_${saveId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Remap old socket IDs to new ones when resuming a loaded game
function remapPlayerIds(gameState, nameToNewId) {
    const idMap = {};
    gameState.players.forEach(p => {
        if (nameToNewId[p.name]) {
            idMap[p.id] = nameToNewId[p.name];
        }
    });

    // Remap players
    gameState.players = gameState.players.map(p => ({
        ...p,
        id: idMap[p.id] || p.id
    }));

    // Remap hc
    const newHc = {};
    Object.entries(gameState.hc || {}).forEach(([id, val]) => {
        newHc[idMap[id] || id] = val;
    });
    gameState.hc = newHc;

    // Remap ai
    gameState.ai = (gameState.ai || []).map(id => idMap[id] || id);

    // Remap scores
    const newScores = {};
    Object.entries(gameState.scores || {}).forEach(([id, val]) => {
        newScores[idMap[id] || id] = val;
    });
    gameState.scores = newScores;

    // Remap origSt
    if (gameState.origSt) {
        const newOrigSt = {};
        Object.entries(gameState.origSt).forEach(([id, val]) => {
            newOrigSt[idMap[id] || id] = val;
        });
        gameState.origSt = newOrigSt;
    }

    // Remap rBets (index-based keys, no change needed)

    // Reset confirmations
    gameState.confirmations = [];

    // Remap history acts
    if (gameState.history) {
        gameState.history = gameState.history.map(h => ({
            ...h,
            stacks: h.stacks ? Object.fromEntries(Object.entries(h.stacks).map(([id, v]) => [idMap[id] || id, v])) : {},
            playerNames: h.playerNames ? Object.fromEntries(Object.entries(h.playerNames).map(([id, v]) => [idMap[id] || id, v])) : {},
            net: h.net ? Object.fromEntries(Object.entries(h.net).map(([id, v]) => [idMap[id] || id, v])) : {},
            acts: (h.acts || []).map(a => ({ ...a, id: idMap[a.id] || a.id }))
        }));
    }

    // Remap cp eligible
    if (gameState.cp) {
        gameState.cp = gameState.cp.map(pot => ({
            ...pot,
            eligible: (pot.eligible || []).map(e => ({
                ...e,
                id: idMap[e.id] || e.id
            }))
        }));
    }

    // Remap potAward eligibleIds
    if (gameState.potAward && gameState.potAward.eligibleIds) {
        gameState.potAward.eligibleIds = gameState.potAward.eligibleIds.map(id => idMap[id] || id);
    }
}

module.exports = { saveGame, saveAutosave, listSaves, loadSave, remapPlayerIds };
