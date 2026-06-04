const { createClient } = require('@supabase/supabase-js');

const MAX_NAMED_SAVES = 7;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[saveManager] WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY not set — saves will fail');
}

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

async function saveGame(gameState, roomPlayers, options = {}) {
    const { name, overwriteSaveId } = options;
    const saveId = Date.now().toString(36);
    const stateCopy = JSON.parse(JSON.stringify(gameState));
    delete stateCopy.confirmations;

    const saveData = {
        saveId,
        name: name || null,
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
        if (e.message?.startsWith('DUPLICATE_NAME:')) throw e;
        console.error('[saveManager] saveGame failed:', e.message);
    }

    return overwriteSaveId || saveId;
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
        sessionNumber: gameState.sn,
        linkedSaveId: gameState.loadedFromSaveId || null
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

        const items = (data || []).map(row => ({
            saveId: row.id,
            name: row.data.name || ('Save ' + (row.id || '').toUpperCase()),
            savedAt: row.data.savedAt,
            playerNames: row.data.playerNames,
            playerCount: row.data.playerCount,
            handNumber: row.data.handNumber,
            sessionNumber: row.data.sessionNumber,
            scores: row.data.gameState?.scores || {},
            stacks: (row.data.gameState?.players || []).map(p => ({ id: p.id, name: p.name, stack: p.stack })),
            cfg: row.data.gameState?.cfg || null,
            phase: row.data.gameState?.phase || null,
            linkedSaveId: row.data.linkedSaveId || null,
        }));

        const autosave = items.find(s => s.saveId === 'autosave');
        if (autosave?.linkedSaveId) {
            const linked = items.find(s => s.saveId === autosave.linkedSaveId);
            autosave.linkedName = linked?.name || null;
            autosave.synced = linked
                ? autosave.handNumber === linked.handNumber
                    && autosave.sessionNumber === linked.sessionNumber
                    && autosave.phase === linked.phase
                : false;
        }

        const named = items.filter(s => s.saveId !== 'autosave');
        return autosave ? [autosave, ...named] : named;
    } catch (e) {
        console.error('[saveManager] listSaves failed:', e.message);
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
}

async function deleteSave(saveId) {
    if (saveId === 'autosave') throw new Error('Cannot delete autosave');

    try {
        const { data: autosaveRow } = await supabase
            .from('saves')
            .select('data')
            .eq('id', 'autosave')
            .single();
        if (autosaveRow?.data?.linkedSaveId === saveId) {
            const updatedData = { ...autosaveRow.data, linkedSaveId: null };
            await supabase
                .from('saves')
                .update({ data: updatedData })
                .eq('id', 'autosave');
        }
    } catch (e) {
        console.error('[deleteSave] linkedSaveId cleanup failed (non-fatal):', e.message);
    }

    const { error } = await supabase
        .from('saves')
        .delete()
        .eq('id', saveId);
    if (error) throw error;
}

async function promoteAutosave(name) {
    const { data: nameHit } = await supabase
        .from('saves')
        .select('id')
        .filter('data->>name', 'eq', name);
    if (nameHit?.length) throw new Error('DUPLICATE_NAME:' + name);

    const autosaveData = await loadSave('autosave');
    if (!autosaveData) throw new Error('No autosave found');

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

    const saveId = Date.now().toString(36);
    const saveData = { ...autosaveData, saveId, name, savedAt: new Date().toISOString() };
    delete saveData.linkedSaveId;
    const { error: insErr } = await supabase
        .from('saves')
        .insert({ id: saveId, data: saveData });
    if (insErr) throw insErr;

    const { data: autosaveRow, error: fetchErr } = await supabase
        .from('saves')
        .select('data')
        .eq('id', 'autosave')
        .single();
    if (fetchErr) throw fetchErr;
    const { error: linkErr } = await supabase
        .from('saves')
        .update({ data: { ...autosaveRow.data, linkedSaveId: saveId } })
        .eq('id', 'autosave');
    if (linkErr) throw linkErr;

    return saveId;
}

async function syncAutosaveWithLinked() {
    const { data: autosaveRow, error: fetchErr } = await supabase
        .from('saves')
        .select('data')
        .eq('id', 'autosave')
        .single();
    if (fetchErr || !autosaveRow) throw new Error('No autosave found');

    const linkedId = autosaveRow.data.linkedSaveId;
    if (!linkedId) throw new Error('Autosave has no linked save');

    const { data: linkedRow, error: linkedErr } = await supabase
        .from('saves')
        .select('data')
        .eq('id', linkedId)
        .single();
    if (linkedErr || !linkedRow) throw new Error('Linked save not found');

    const mergedData = {
        ...autosaveRow.data,
        saveId: linkedId,
        name: linkedRow.data.name
    };
    delete mergedData.linkedSaveId;
    const { error: updErr } = await supabase
        .from('saves')
        .update({ data: mergedData })
        .eq('id', linkedId);
    if (updErr) throw updErr;
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

module.exports = { saveGame, saveAutosave, listSaves, loadSave, renameSave, deleteSave, promoteAutosave, syncAutosaveWithLinked, remapPlayerIds };
