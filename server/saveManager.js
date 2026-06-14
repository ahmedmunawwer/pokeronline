const { createClient } = require('@supabase/supabase-js');
const scoreboardManager = require('./scoreboardManager');

const MAX_NAMED_SAVES = 30;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[saveManager] WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY not set — saves will fail');
}

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

async function saveGame(gameState, roomPlayers, options = {}) {
    const { name, overwriteSaveId, hostName, isGameActive } = options;
    const saveId = Date.now().toString(36);
    const stateCopy = JSON.parse(JSON.stringify(gameState));
    delete stateCopy.confirmations;

    const saveData = {
        saveId,
        name: name || null,
        hostName: hostName || null,
        savedAt: new Date().toISOString(),
        playerNames: roomPlayers.map(p => p.name),
        playerCount: roomPlayers.length,
        gameState: stateCopy,
        handNumber: gameState.hn,
        sessionNumber: gameState.sn
    };

    try {
        if (overwriteSaveId) {
            const { data: existing, error: fetchErr } = await supabase
                .from('saves')
                .select('data')
                .eq('id', overwriteSaveId)
                .single();
            if (fetchErr) throw fetchErr;

            const mergedData = {
                ...existing.data,
                savedAt: new Date().toISOString(),
                playerNames: roomPlayers.map(p => p.name),
                playerCount: roomPlayers.length,
                gameState: stateCopy,
                handNumber: gameState.hn,
                sessionNumber: gameState.sn
            };

            const { error: updErr } = await supabase
                .from('saves')
                .update({ data: mergedData })
                .eq('id', overwriteSaveId);
            if (updErr) throw updErr;
            try { await scoreboardManager.writeEntry(overwriteSaveId, stateCopy, mergedData.name); }
            catch (sbErr) { console.warn('[scoreboard] writeEntry failed (non-fatal):', sbErr.message); }
            return overwriteSaveId;
        }

        if (name) {
            const { data: nameHit } = await supabase
                .from('saves')
                .select('id')
                .filter('data->>name', 'eq', name);
            if (nameHit?.length) throw new Error('DUPLICATE_NAME:' + name);
        }

        const { data: existing, error: listErr } = await supabase
            .from('saves')
            .select('id, updated_at')
            .order('updated_at', { ascending: true });

        if (listErr) throw listErr;

        if (existing && existing.length >= MAX_NAMED_SAVES) {
            const evict = existing.find(row => !isGameActive || !isGameActive(row.id));
            if (!evict) throw new Error('Save cap reached: all saved games are currently active');
            const { error: delErr } = await supabase
                .from('saves')
                .delete()
                .eq('id', evict.id);
            if (delErr) throw delErr;
        }

        const { error: insErr } = await supabase
            .from('saves')
            .insert({ id: saveId, data: saveData });
        if (insErr) throw insErr;
        try { await scoreboardManager.writeEntry(saveId, stateCopy, name); }
        catch (sbErr) { console.warn('[scoreboard] writeEntry failed (non-fatal):', sbErr.message); }
    } catch (e) {
        if (e.message?.startsWith('DUPLICATE_NAME:')) throw e;
        if (e.message?.startsWith('Save cap reached:')) throw e;
        console.error('[saveManager] saveGame failed:', e.message);
    }

    return overwriteSaveId || saveId;
}

async function listGames() {
    try {
        const { data, error } = await supabase
            .from('saves')
            .select('id, data')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        const items = (data || []).map(row => {
            const d = row.data;
            const sn = d.gameState?.sn ?? d.sessionNumber ?? 0;
            const totalSessions = d.gameState?.cfg?.sessions ?? null;
            const completionStatus = totalSessions && sn > totalSessions ? 'completed' : 'in_progress';
            return {
                saveId: row.id,
                name: d.name || ('Save ' + (row.id || '').toUpperCase()),
                hostName: d.hostName || null,
                savedAt: d.savedAt,
                playerNames: d.playerNames,
                playerCount: d.playerCount,
                handNumber: d.handNumber,
                sessionNumber: d.sessionNumber,
                scores: d.gameState?.scores || {},
                stacks: (d.gameState?.players || []).map(p => ({ id: p.id, name: p.name, stack: p.stack })),
                cfg: d.gameState?.cfg || null,
                phase: d.gameState?.phase || null,
                completionStatus,
            };
        });

        return items.filter(s => s.completionStatus === 'in_progress');
    } catch (e) {
        console.error('[saveManager] listGames failed:', e.message);
        return [];
    }
}

async function renameSave(saveId, newName) {
    const { data: rows, error: fetchErr } = await supabase
        .from('saves')
        .select('data')
        .eq('id', saveId)
        .single();
    if (fetchErr || !rows) throw new Error('Save not found');

    const { data: nameHit } = await supabase
        .from('saves')
        .select('id')
        .filter('data->>name', 'eq', newName)
        .neq('id', saveId);
    if (nameHit?.length) throw new Error('DUPLICATE_NAME:' + newName);

    const updated = { ...rows.data, name: newName };
    const { error: updErr } = await supabase
        .from('saves')
        .update({ data: updated })
        .eq('id', saveId);
    if (updErr) throw updErr;
    try { await scoreboardManager.renameEntry(saveId, newName); }
    catch (sbErr) { console.warn('[scoreboard] renameEntry failed (non-fatal):', sbErr.message); }
}

async function deleteSave(saveId) {
    const { error } = await supabase
        .from('saves')
        .delete()
        .eq('id', saveId);
    if (error) throw error;
    try { await scoreboardManager.markTerminated(saveId); }
    catch (sbErr) { console.warn('[scoreboard] markTerminated failed (non-fatal):', sbErr.message); }
}

async function loadSave(saveId) {
    try {
        const { data, error } = await supabase
            .from('saves')
            .select('data')
            .eq('id', saveId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null;
            throw error;
        }

        return data?.data ?? null;
    } catch (e) {
        console.error('[saveManager] loadSave failed:', e.message);
        return null;
    }
}

function remapPlayerIds(gameState, nameToNewId) {
    const idMap = {};
    gameState.players.forEach(p => {
        if (nameToNewId[p.name]) {
            idMap[p.id] = nameToNewId[p.name];
        }
    });

    gameState.players = gameState.players.map(p => ({
        ...p,
        id: idMap[p.id] || p.id
    }));

    const newHc = {};
    Object.entries(gameState.hc || {}).forEach(([id, val]) => {
        newHc[idMap[id] || id] = val;
    });
    gameState.hc = newHc;

    gameState.ai = (gameState.ai || []).map(id => idMap[id] || id);

    const newScores = {};
    Object.entries(gameState.scores || {}).forEach(([id, val]) => {
        newScores[idMap[id] || id] = val;
    });
    gameState.scores = newScores;

    if (gameState.origSt) {
        const newOrigSt = {};
        Object.entries(gameState.origSt).forEach(([id, val]) => {
            newOrigSt[idMap[id] || id] = val;
        });
        gameState.origSt = newOrigSt;
    }

    gameState.confirmations = [];

    if (gameState.history) {
        gameState.history = gameState.history.map(h => ({
            ...h,
            stacks: h.stacks ? Object.fromEntries(Object.entries(h.stacks).map(([id, v]) => [idMap[id] || id, v])) : {},
            playerNames: h.playerNames ? Object.fromEntries(Object.entries(h.playerNames).map(([id, v]) => [idMap[id] || id, v])) : {},
            net: h.net ? Object.fromEntries(Object.entries(h.net).map(([id, v]) => [idMap[id] || id, v])) : {},
            acts: (h.acts || []).map(a => ({ ...a, id: idMap[a.id] || a.id }))
        }));
    }

    if (gameState.cp) {
        gameState.cp = gameState.cp.map(pot => ({
            ...pot,
            eligible: (pot.eligible || []).map(e => ({
                ...e,
                id: idMap[e.id] || e.id
            }))
        }));
    }

    if (gameState.sessionHistory) {
        gameState.sessionHistory = gameState.sessionHistory.map(entry => ({
            ...entry,
            scores: Object.fromEntries(
                Object.entries(entry.scores || {}).map(([id, v]) => [idMap[id] || id, v])
            )
        }));
    }

    if (gameState.potAward && gameState.potAward.eligibleIds) {
        gameState.potAward.eligibleIds = gameState.potAward.eligibleIds.map(id => idMap[id] || id);
    }
}

async function checkNameAvailable(name) {
    try {
        const { data } = await supabase.from('saves').select('id').filter('data->>name', 'eq', name).limit(1);
        return !data?.length;
    } catch (e) {
        console.error('[saveManager] checkNameAvailable failed:', e.message);
        return true;
    }
}

module.exports = { saveGame, listGames, loadSave, renameSave, deleteSave, remapPlayerIds, checkNameAvailable };
