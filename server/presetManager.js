const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

const PRESET_CAP = 30;
const DEFAULT_NAMES = ['Munz', 'Ray', 'Rizu', 'Rit', 'Manu', 'Ramez', 'Zanu', 'Sapu', 'Fahim'];

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

function validate(name) {
    const trimmed = (name || '').trim();
    if (trimmed.length < 3 || trimmed.length > 9) return 'Name must be 3–9 characters';
    return null;
}

async function listPresets() {
    const { data, error } = await supabase.from('presets').select('id, data');
    if (error) throw error;
    const presets = (data || []).map(row => ({ id: row.id, name: row.data.name }));
    presets.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return presets;
}

async function addPreset(name) {
    const err = validate(name);
    if (err) throw new Error(err);
    const trimmed = name.trim();

    const { data: all, error: fetchErr } = await supabase.from('presets').select('id, data');
    if (fetchErr) throw fetchErr;

    if ((all || []).length >= PRESET_CAP) throw new Error('Preset cap reached, delete some first');

    const dup = (all || []).find(r => r.data.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) throw new Error('Already in presets');

    const id = randomUUID();
    const { error } = await supabase.from('presets').insert({ id, data: { name: trimmed } });
    if (error) throw error;
    return id;
}

async function renamePreset(presetId, newName) {
    const err = validate(newName);
    if (err) throw new Error(err);
    const trimmed = newName.trim();

    const { data: all, error: fetchErr } = await supabase.from('presets').select('id, data');
    if (fetchErr) throw fetchErr;

    const dup = (all || []).find(r => r.id !== presetId && r.data.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) throw new Error('Already in presets');

    const { error } = await supabase.from('presets').update({ data: { name: trimmed } }).eq('id', presetId);
    if (error) throw error;
}

async function deletePreset(presetId) {
    const { error } = await supabase.from('presets').delete().eq('id', presetId);
    if (error) throw error;
}

async function seedDefaults() {
    const { data, error } = await supabase.from('presets').select('id');
    if (error) { console.error('presetManager seedDefaults:', error); return; }
    if (data && data.length > 0) return;
    for (const name of DEFAULT_NAMES) {
        const id = randomUUID();
        await supabase.from('presets').insert({ id, data: { name } });
    }
}

module.exports = { listPresets, addPreset, renamePreset, deletePreset, seedDefaults };
