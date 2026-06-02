const { createClient } = require('@supabase/supabase-js');

const MAX_NAMED_SAVES = 7;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[saveManager] WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY not set — saves will fail');
}

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

async function saveGame(gameState, roomPlayers) {
    const saveId = Date.now().toString(36);
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

    try {
        const { data: existing, error: listErr } = await supabase
            .from('saves')
            .select('id, updated_at')
            .neq('id', 'autosave')
            .order('updated_at', { ascending: true });

        if (listErr) throw listErr;

        if (existing && existing.length >= MAX_NAMED_SAVES) {
            const { error: delErr } = await supabase
                .from('saves')
                .delete()
                .eq('id', existing[0].id);
            if (delErr) throw delErr;
        }

        const { error: insErr } = await supabase
            .from('saves')
            .insert({ id: saveId, data: saveData });
        if (insErr) throw insErr;
    } catch (e) {
        console.error('[saveManager] saveGame failed:', e.message);
    }

    return saveId;
}

async function saveAutosave(gameState, roomPlayers) {
    const stateCopy = JSON.parse(JSON.stringify(gameState));
    delete stateCopy.confirmations;

    const saveData = {
        saveId: 'autosave',
        savedAt: new Date().toISOString(),
        playerNames: roomPlayers.map(p => p.name),
        playerCount: roomPlayers.length,
        gameState: stateCopy,
        handNumber: gameState.hn,
        sessionNumber: gameState.sn
    };

    try {
        const { error } = await supabase
            .from('saves')
            .upsert({ id: 'autosave', data: saveData }, { onConflict: 'id' });
        if (error) throw error;
    } catch (e) {
        console.error('[autosave] write failed:', e.message);
    }
}

async function listSaves() {
    try {
        const { data, error } = await supabase
            .from('saves')
            .select('id, data')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        return (data || []).map(row => ({
            saveId: row.data.saveId,
            savedAt: row.data.savedAt,
            playerNames: row.data.playerNames,
            playerCount: row.data.playerCount,
            handNumber: row.data.handNumber,
            sessionNumber: row.data.sessionNumber
        }));
    } catch (e) {
        console.error('[saveManager] listSaves failed:', e.message);
        return [];
    }
}

async function loadSave(saveId) {
    try {
        const { data, error } = await supabase
            .from('saves')
            .select('data')
            .eq('id', saveId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // row not found
            throw error;
        }

        return data?.data ?? null;
    } catch (e) {
        console.error('[saveManager] loadSave failed:', e.message);
        return null;
    }
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
