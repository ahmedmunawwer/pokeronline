const { createClient } = require('@supabase/supabase-js');

const MAX_ENTRIES = 50;

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

function completionStatus(gameState) {
    if (!gameState?.cfg) return 'in_progress';
    if (gameState.phase === 'game_over') return 'completed';
    if (gameState.sn > gameState.cfg.sessions) return 'completed';
    return 'in_progress';
}

function computeWinner(scores, players, status) {
    if (status !== 'completed') return null;
    let maxScore = 0, winnerId = null;
    for (const [id, score] of Object.entries(scores || {})) {
        if (score > maxScore) { maxScore = score; winnerId = id; }
    }
    if (!winnerId) return null;
    return players.find(p => p.id === winnerId)?.name || null;
}

function buildData(unsId, gameState, name, originalName, createdAt, historyOverride) {
    const now = new Date().toISOString();
    const cfg = gameState?.cfg || null;
    const players = gameState?.players || [];
    const scores = gameState?.scores || {};
    const status = completionStatus(gameState);
    return {
        id: unsId,
        name,
        originalName,
        createdAt,
        lastUpdatedAt: now,
        completionStatus: status,
        totalSessions: cfg?.sessions || null,
        sessionsCompleted: status === 'completed'
            ? Math.min(gameState?.sn || 1, cfg?.sessions || 1)
            : Math.max(0, (gameState?.sn || 1) - 1),
        totalHands: (historyOverride || gameState?.history || []).length,
        bb: cfg?.bb || null,
        sb: cfg?.sb || null,
        playerCount: players.length,
        playerNames: players.map(p => p.name),
        scores,
        sessionHistory: gameState?.sessionHistory || [],
        history: historyOverride || gameState?.history || [],
        winner: computeWinner(scores, players, status),
        gameState: {
            players: players.map(p => ({ id: p.id, name: p.name })),
            cfg
        }
    };
}

async function enforceCap() {
    const { data, error } = await supabase
        .from('scoreboard')
        .select('id, data, created_at')
        .order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length < MAX_ENTRIES) return;
    const completed = data.filter(r => r.data.completionStatus === 'completed');
    const toDelete = completed.length > 0 ? completed[0] : data[0];
    const { error: delErr } = await supabase.from('scoreboard').delete().eq('id', toDelete.id);
    if (delErr) throw delErr;
}

async function writeEntry(unsId, gameState, name) {
    if (!name) return;

    const { data: existing, error: fetchErr } = await supabase
        .from('scoreboard')
        .select('data')
        .eq('id', unsId)
        .single();
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;

    const existingHistory = existing ? (existing.data.history || []) : [];
    const currentHistory = gameState?.history || [];
    const existingKeys = new Set(existingHistory.map(h => h.sn + ':' + h.hn));
    const mergedHistory = [
        ...existingHistory,
        ...currentHistory.filter(h => !existingKeys.has(h.sn + ':' + h.hn))
    ];

    const now = new Date().toISOString();

    if (existing) {
        const updated = buildData(unsId, gameState, name, existing.data.originalName, existing.data.createdAt, mergedHistory);
        const { error } = await supabase
            .from('scoreboard')
            .update({ data: updated })
            .eq('id', unsId);
        if (error) throw error;
    } else {
        await enforceCap();
        const entry = buildData(unsId, gameState, name, name, now, mergedHistory);
        const { error } = await supabase
            .from('scoreboard')
            .insert({ id: unsId, data: entry });
        if (error) throw error;
    }
}

async function renameEntry(unsId, newName) {
    const { data: existing, error: fetchErr } = await supabase
        .from('scoreboard')
        .select('data')
        .eq('id', unsId)
        .single();
    if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;
    if (!existing) return;

    const updated = { ...existing.data, name: newName, lastUpdatedAt: new Date().toISOString() };
    const { error } = await supabase
        .from('scoreboard')
        .update({ data: updated })
        .eq('id', unsId);
    if (error) throw error;
}

async function listEntries() {
    const { data, error } = await supabase
        .from('scoreboard')
        .select('id, data')
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(row => row.data);
}

module.exports = { writeEntry, renameEntry, listEntries };
