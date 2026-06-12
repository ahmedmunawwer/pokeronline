const roomManager = require('./roomManager');
const saveManager = require('./saveManager');
const scoreboardManager = require('./scoreboardManager');

const AUTOSAVE_PHASES = new Set(['preflop_start', 'flop_reveal', 'turn_reveal', 'river_reveal', 'end', 'session_end']);

const DEALER_CEREMONY_PHASES = new Set([
    'preflop_start', 'flop_reveal', 'turn_reveal', 'river_reveal',
    'showdown', 'end', 'session_end'
]);

// Advance gs.dealer forward past any inactive players.
function rotateDealerForward(gs) {
    const n = gs.players.length;
    for (let i = 1; i <= n; i++) {
        const next = (gs.dealer + i) % n;
        if (!gs.players[next].inactive) { gs.dealer = next; break; }
    }
}

// When a player leaves/disconnects mid-game, clean up the hand so the
// remaining player is never stuck waiting for the leaver to act.
function resolveLeaveImpact(gs) {
    const midHandPhases = ['preflop_start','preflop','flop','flop_reveal','turn','turn_reveal','river','river_reveal','showdown'];
    const activePlayers = gs.players.filter(p => !p.inactive && p.stack > 0);

    if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        // Award any pot that was still on the table
        if (gs.pot > 0 && midHandPhases.includes(gs.phase)) {
            gs.players = gs.players.map(p =>
                p.id === winner.id ? { ...p, stack: p.stack + gs.pot } : p
            );
            if (!gs.log) gs.log = [];
            gs.log.unshift(winner.name + " wins " + gs.pot + " (opponent left)");
            gs.wi = { name: winner.name, amt: gs.pot };
            gs.pot = 0;
        }
        gs.queue = [];
        gs.rBets = {};
        gs.phase = 'end';
        if (!gs.wi) gs.wi = { name: winner.name, amt: 0 };
        // Force the game-over screen: only 1 player left, no point continuing
        if (gs.cfg) gs.sn = gs.cfg.sessions;
    } else if (gs.phase === 'end' && gs.players[gs.dealer] && gs.players[gs.dealer].inactive) {
        // Dealer left after the hand ended — rotate to the next active player
        // so the survivor sees their own "Next Hand" button instead of a deadlock.
        const n = gs.players.length;
        for (let i = 1; i <= n; i++) {
            const next = (gs.dealer + i) % n;
            if (!gs.players[next].inactive) { gs.dealer = next; break; }
        }
    }
}

function rejectIfStalled(socket, room, callback) {
    if (!room || !room.stalled) return false;
    socket.emit('game_stalled', { leftBy: room.stalledBy });
    if (callback) callback({ success: false });
    return true;
}

module.exports = function(io) {
    io.on('connection', (socket) => {
        
        socket.on('host_game', (data, callback) => {
            try {
                const roomCode = roomManager.createRoom(data.roomCode);
                socket.join(roomCode);
                socket.currentRoom = roomCode;

                roomManager.joinRoom(roomCode, socket.id, data.name, true, data.maxPlayers, data.equalStack);
                if (data.secondName) {
                    try {
                        roomManager.joinRoom(roomCode, socket.id, data.secondName, false, undefined, undefined, socket.id + '_2');
                    } catch (innerError) {
                        roomManager.removeClientFromRoom(roomCode, socket.id);
                        throw innerError;
                    }
                }

                const room = roomManager.getRoom(roomCode);
                const player = room.players.find(p => p.id === socket.id);
                const player2 = data.secondName ? room.players.find(p => p.id === socket.id + '_2') : null;
                callback({ success: true, roomCode, playerId: player ? player.pId : null, secondPlayerId: player2 ? player2.pId : undefined });
                io.to(roomCode).emit('lobby_update', roomManager.getRoom(roomCode));
            } catch (error) {
                callback({ success: false, message: error.message || "Server Error" });
            }
        });

        socket.on('join_game', (data, callback) => {
            try {
                const roomCode = data.roomCode;
                const room = roomManager.getRoom(roomCode);
                if (!room) {
                    callback({ success: false, message: "Room does not exist" });
                    return;
                }

                socket.join(roomCode);
                socket.currentRoom = roomCode;

                roomManager.joinRoom(roomCode, socket.id, data.name, false);
                if (data.secondName) {
                    try {
                        roomManager.joinRoom(roomCode, socket.id, data.secondName, false, undefined, undefined, socket.id + '_2');
                    } catch (innerError) {
                        roomManager.removeClientFromRoom(roomCode, socket.id);
                        throw innerError;
                    }
                }

                const player = room.players.find(p => p.id === socket.id);
                const player2 = data.secondName ? room.players.find(p => p.id === socket.id + '_2') : null;
                callback({ success: true, playerId: player ? player.pId : null, secondPlayerId: player2 ? player2.pId : undefined });
                io.to(roomCode).emit('lobby_update', roomManager.getRoom(roomCode));
            } catch (error) {
                // If join failed, leave the socket room
                if (socket.currentRoom) {
                    socket.leave(socket.currentRoom);
                    socket.currentRoom = null;
                }
                callback({ success: false, message: error.message || "Join Error" });
            }
        });

        socket.on('get_default_room_codes', (callback) => {
            callback(roomManager.getRoomCodeSuggestions());
        });

        socket.on('get_default_name', (roomCode, callback) => {
            const room = roomManager.getRoom(roomCode);
            if (!room) {
                callback({ existingNames: [] });
                return;
            }
            if (room.isLoaded) {
                callback({ expectedNames: room.expectedNames });
                return;
            }
            const existingNames = room.players.map(p => p.name);
            callback({ existingNames });
        });

        socket.on('set_ready', (data) => {
            if (!socket.currentRoom) return;
            const isObj = data !== null && typeof data === 'object';
            const playerId = isObj ? (data.playerId || socket.id) : socket.id;
            const ready = isObj ? data.ready : data;
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room) return;
            const ownedSeats = room.socketSeats?.[socket.id];
            if (ownedSeats && !ownedSeats.includes(playerId)) {
                return;
            }
            roomManager.setPlayerReady(socket.currentRoom, playerId, ready);
            io.to(socket.currentRoom).emit('lobby_update', room);
        });

        socket.on('lock_room', () => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (room && room.hostId === socket.id) {
                room.setupPhase = 'configuring';
                io.to(socket.currentRoom).emit('lobby_update', room);
            }
        });

        socket.on('start_countdown', (settings) => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room)) return;
            if (!room || room.hostId !== socket.id) return;

            room.setupPhase = 'countdown';
            room.settings = settings; // Store settings to broadcast
            io.to(socket.currentRoom).emit('lobby_update', room);

            // Snapshot pId→stack now, while socket IDs and settings.stacks are in sync.
            // sync_reconnect may remap room.players[i].id before the timeout fires; pId is stable.
            const stackByPId = {};
            room.players.forEach(p => {
                if (settings.stacks[p.id] !== undefined) stackByPId[p.pId] = settings.stacks[p.id];
            });
            const oldIdToPId = {};
            room.players.forEach(p => { oldIdToPId[p.id] = p.pId; });

            // 5 second countdown before actual game start
            setTimeout(() => {
                const liveRoom = roomManager.getRoom(socket.currentRoom);
                if (!liveRoom) return;

                liveRoom.setupPhase = 'in_game';

                const { startHand } = require('./gameEngine');
                liveRoom.gameState.cfg = settings.cfg;

                // Construct players array for gameEngine
                const gamePlayers = liveRoom.players.map((p) => {
                    const stack = stackByPId[p.pId];
                    if (stack === undefined) console.warn('[start_countdown] missing stack for pId=' + p.pId + ' name=' + p.name);
                    return { id: p.id, name: p.name, stack: stack ?? 0, folded: false };
                });
                liveRoom.gameState.players = gamePlayers;
                
                const os = {}, is = {};
                gamePlayers.forEach((p) => { 
                    os[p.id] = p.stack; 
                    is[p.id] = 0; 
                });
                liveRoom.gameState.origSt = os;
                liveRoom.gameState.scores = is;

                liveRoom.gameState.sessionHistory = [];

                if (settings.startFromSession) {
                    liveRoom.gameState.sn = settings.startFromSession;
                }

                if (settings.presetScores) {
                    const pIdToNewId = {};
                    liveRoom.players.forEach(p => { pIdToNewId[p.pId] = p.id; });
                    const remapScores = (raw) => {
                        const out = {};
                        Object.entries(raw || {}).forEach(([oldId, v]) => {
                            const newId = pIdToNewId[oldIdToPId[oldId]] || oldId;
                            out[newId] = v;
                        });
                        return out;
                    };
                    const ps = settings.presetScores;
                    if (ps.mode === 'per_session') {
                        liveRoom.gameState.sessionHistory = (ps.sessionHistory || []).map(entry => ({
                            sn: entry.sn,
                            scores: remapScores(entry.scores)
                        }));
                        const cumScores = {};
                        liveRoom.gameState.sessionHistory.forEach(entry => {
                            Object.entries(entry.scores).forEach(([id, v]) => {
                                cumScores[id] = (cumScores[id] || 0) + v;
                            });
                        });
                        liveRoom.gameState.scores = cumScores;
                    } else if (ps.mode === 'total') {
                        const remapped = remapScores(ps.totalScores);
                        liveRoom.gameState.scores = remapped;
                        liveRoom.gameState.sessionHistory = [{
                            sn: settings.startFromSession - 1,
                            scores: remapped,
                            isTotal: true
                        }];
                    }
                }

                startHand(liveRoom.gameState);
                io.to(socket.currentRoom).emit('lobby_update', liveRoom);
                io.to(socket.currentRoom).emit('game_state_update', liveRoom.gameState);
                saveManager.saveAutosave(liveRoom.gameState, liveRoom.players);
            }, 5000);
        });

        socket.on('player_action', (data) => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room)) return;
            if (!room) return;

            const { processAction } = require('./gameEngine');
            
            const gs = room.gameState;

            // Handle undo: restore previous snapshot
            if (data.action === 'undo') {
                if (!room.undoStack || !room.undoStack.length) return;
                const prev = room.undoStack.pop();
                // Restore all keys from snapshot
                Object.keys(prev).forEach(k => { gs[k] = prev[k]; });
                io.to(socket.currentRoom).emit('game_state_update', gs);
                return;
            }

            // Save snapshot before processing (for undo)
            if (!room.undoStack) room.undoStack = [];
            const snapshot = JSON.parse(JSON.stringify(gs));
            room.undoStack.push(snapshot);
            if (room.undoStack.length > 20) room.undoStack.shift();

            // Record starting stacks for history diff
            const stacksBefore = {};
            gs.players.forEach(p => { stacksBefore[p.id] = p.stack; });

            // Auto-fill playerId with the active player since this is a shared tracker
            const actI = gs.queue && gs.queue[0];
            if (actI !== undefined && actI !== null && gs.players[actI]) {
                data.playerId = gs.players[actI].id;
            }

            // Ownership guard: socket must own the seat currently in queue
            const ownedSeats = room.socketSeats?.[socket.id];
            const isCeremony = ['reveal', 'award_win', 'split_win', 'next_hand', 'next_session', 'next_pot', 'undo'].includes(data.action);
            if (ownedSeats && !isCeremony && actI !== undefined && actI !== null && !ownedSeats.includes(data.playerId)) {
                console.warn('[player_action] socket', socket.id, 'tried to act for unowned seat', data.playerId);
                return;
            }

            if (actI !== undefined && actI !== null && gs.players[actI]?.disconnected && !isCeremony) return;

            const phaseBefore = gs.phase;
            processAction(gs, data);

            // Record hand history when transitioning INTO 'end' or 'session_end'
            if ((gs.phase === 'end' || gs.phase === 'session_end') &&
                phaseBefore !== 'end' && phaseBefore !== 'session_end') {
                gs.confirmations = [];
                const net = {};
                const baseStacks = gs.stacksBefore || stacksBefore;
                gs.players.forEach(p => { net[p.id] = p.stack - (baseStacks[p.id] || 0); });
                const stacks = {};
                gs.players.forEach(p => { stacks[p.id] = p.stack; });
                const playerNames = {};
                gs.players.forEach(p => { playerNames[p.id] = p.name; });
                const wiPlayer = gs.wi ? gs.players.find(p => p.name === gs.wi.name) : null;
                const histRecord = {
                    sn: gs.sn,
                    hn: gs.hn,
                    wid: wiPlayer ? wiPlayer.id : null,
                    wname: gs.wi ? gs.wi.name : null,
                    hr: gs.wi ? gs.wi.hr : null,
                    net: net,
                    stacks: stacks,
                    playerNames: playerNames,
                    acts: gs.curActs || []
                };
                if (!gs.history) gs.history = [];
                gs.history.push(histRecord);
            }

            io.to(socket.currentRoom).emit('game_state_update', gs);
            if (AUTOSAVE_PHASES.has(gs.phase)) {
                saveManager.saveAutosave(gs, room.players);
            }
        });

        socket.on('confirm_result', (data) => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room)) return;
            if (!room) return;
            const playerId = data?.playerId || socket.id;
            const ownedSeats = room.socketSeats?.[socket.id];
            if (ownedSeats && !ownedSeats.includes(playerId)) return;
            const gs = room.gameState;
            if (!gs.confirmations) gs.confirmations = [];
            if (!gs.confirmations.includes(playerId)) {
                gs.confirmations.push(playerId);
            }
            io.to(socket.currentRoom).emit('game_state_update', gs);
        });

        socket.on('dissent_result', () => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room)) return;
            if (!room) return;
            const gs = room.gameState;
            gs.confirmations = [];
            gs.potAward = null;
            io.to(socket.currentRoom).emit('game_state_update', gs);
        });

        socket.on('leave_room', () => {
            if (socket.currentRoom) {
                const room = roomManager.getRoom(socket.currentRoom);
                if (room && room.setupPhase === 'in_game') {
                    // Fold if it's their turn before marking inactive
                    const gs = room.gameState;
                    const actI = gs.queue && gs.queue[0];
                    if (actI !== undefined && gs.players[actI] && gs.players[actI].id === socket.id) {
                        const { processAction } = require('./gameEngine');
                        processAction(gs, { action: 'fold', playerId: socket.id });
                    }
                    roomManager.markPlayerInactive(socket.currentRoom, socket.id);
                } else {
                    roomManager.removeClientFromRoom(socket.currentRoom, socket.id);
                }
                
                socket.leave(socket.currentRoom);
                const updatedRoom = roomManager.getRoom(socket.currentRoom);
                if (updatedRoom) io.to(socket.currentRoom).emit('lobby_update', updatedRoom);
                socket.currentRoom = null;
            }
        });

        socket.on('player_leave_game', (callback) => {
            if (!socket.currentRoom) return callback && callback({ success: false });
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room) return callback && callback({ success: false });

            // Fold if it's their turn
            const gs = room.gameState;
            const actI = gs.queue && gs.queue[0];
            if (actI !== undefined && gs.players[actI] && gs.players[actI].id === socket.id) {
                const { processAction } = require('./gameEngine');
                processAction(gs, { action: 'fold', playerId: socket.id });
            }

            const wasDealer = gs.players[gs.dealer] && gs.players[gs.dealer].id === socket.id;
            roomManager.markPlayerInactive(socket.currentRoom, socket.id);
            const remainingActive = gs.players.filter(p => !p.inactive).length;
            if (wasDealer && DEALER_CEREMONY_PHASES.has(gs.phase) && remainingActive >= 2) {
                rotateDealerForward(gs);
            }
            resolveLeaveImpact(gs);
            const roomCode = socket.currentRoom;
            socket.leave(roomCode);
            socket.currentRoom = null;
            io.to(roomCode).emit('lobby_update', room);
            io.to(roomCode).emit('game_state_update', gs);
            if (callback) callback({ success: true });
        });

        socket.on('host_end_game', async (data, callback) => {
            if (!socket.currentRoom) return callback && callback({ success: false });
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room, callback)) return;
            if (!room || room.hostId !== socket.id) return callback && callback({ success: false });

            const roomCode = socket.currentRoom;

            // Notify all other players
            socket.to(roomCode).emit('game_ended_by_host');

            // Clean up host
            roomManager.removeClientFromRoom(roomCode, socket.id);
            socket.leave(roomCode);
            socket.currentRoom = null;

            // Delete the room
            roomManager.deleteRoom(roomCode);

            if (callback) callback({ success: true });
        });

        socket.on('set_skip_preflop', (data) => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room)) return;
            if (!room || room.hostId !== socket.id) return;
            const gs = room.gameState;
            if (!gs) return;
            gs.skipPreflop = !!data?.enabled;
            io.to(socket.currentRoom).emit('game_state_update', gs);
        });

        // --- Save / Load ---
        socket.on('save_game', async (data, callback) => {
            if (typeof data === 'function') { callback = data; data = {}; }
            if (!socket.currentRoom) return callback({ success: false, message: 'Not in a room' });
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room, callback)) return;
            if (!room || room.hostId !== socket.id) return callback({ success: false, message: 'Only host can save' });
            try {
                const { name, overwriteSaveId } = data || {};
                if (!overwriteSaveId && !name) return callback({ success: false, message: 'Please enter a name' });
                const saveId = await saveManager.saveGame(room.gameState, room.players, { name, overwriteSaveId });
                if (!overwriteSaveId) {
                    room.gameState.loadedFromSaveId = saveId;
                    io.to(socket.currentRoom).emit('game_state_update', room.gameState);
                }
                try {
                    await saveManager.saveAutosave(room.gameState, room.players);
                } catch (e) {
                    console.warn('[save_game] autosave mirror failed (non-fatal):', e.message);
                }
                callback({ success: true, saveId });
            } catch (e) {
                if (e.message?.startsWith('DUPLICATE_NAME:')) {
                    return callback({ success: false, message: e.message });
                }
                callback({ success: false, message: e.message });
            }
        });

        socket.on('rename_save', async (data, callback) => {
            try {
                const { saveId, newName } = data || {};
                if (!saveId || !newName?.trim()) return callback({ success: false, message: 'Name required' });
                await saveManager.renameSave(saveId, newName.trim());
                callback({ success: true });
            } catch (e) {
                if (e.message?.startsWith('DUPLICATE_NAME:')) {
                    return callback({ success: false, message: e.message });
                }
                callback({ success: false, message: e.message });
            }
        });

        socket.on('delete_save', async (data, callback) => {
            try {
                const { saveId } = data || {};
                if (!saveId) return callback({ success: false, message: 'saveId required' });
                await saveManager.deleteSave(saveId);
                callback({ success: true });
            } catch (e) {
                callback({ success: false, message: e.message });
            }
        });

        socket.on('promote_autosave', async (data, callback) => {
            try {
                const name = (data?.name || '').trim();
                if (!name) return callback({ success: false, message: 'Please enter a name' });
                const saveId = await saveManager.promoteAutosave(name);
                callback({ success: true, saveId });
            } catch (e) {
                if (e.message?.startsWith('DUPLICATE_NAME:')) {
                    return callback({ success: false, message: e.message });
                }
                callback({ success: false, message: e.message });
            }
        });

        socket.on('sync_autosave_with_linked', async (callback) => {
            try {
                await saveManager.syncAutosaveWithLinked();
                callback({ success: true });
            } catch (e) {
                callback({ success: false, message: e.message });
            }
        });

        socket.on('list_saves', async (callback) => {
            try {
                const saves = await saveManager.listSaves();
                callback({ success: true, saves });
            } catch (e) {
                callback({ success: false, saves: [], message: e.message });
            }
        });

        socket.on('list_active_games', (callback) => {
            callback({ games: roomManager.listActiveGames() });
        });

        socket.on('list_in_progress_games', (callback) => {
            callback({ games: roomManager.listInProgressGames() });
        });

        socket.on('list_scoreboard', async (callback) => {
            try {
                const entries = await scoreboardManager.listEntries();
                callback({ success: true, entries });
            } catch (e) {
                callback({ success: false, entries: [], message: e.message });
            }
        });

        socket.on('load_game', async (data, callback) => {
            try {
                const save = await saveManager.loadSave(data.saveId);
                if (!save) return callback({ success: false, message: 'Save not found' });

                // Validate host name
                const hostName = (data.hostName || '').trim();
                const nameMatch = save.playerNames.find(n => n.toLowerCase() === hostName.toLowerCase());
                if (!nameMatch) {
                    return callback({ success: false, message: "Name '" + hostName + "' was not in the original game. Expected: " + save.playerNames.join(", ") });
                }

                const roomCode = roomManager.createLoadedRoom(save);
                const lfsId = data.overrideLoadedFromSaveId !== undefined
                    ? data.overrideLoadedFromSaveId
                    : data.saveId;
                roomManager.getRoom(roomCode).gameState.loadedFromSaveId = lfsId;

                // If loading autosave with a linked UNS, use the UNS's name as the room display name
                if (data.saveId === 'autosave' && lfsId && lfsId !== 'autosave') {
                    try {
                        const linkedSave = await saveManager.loadSave(lfsId);
                        if (linkedSave?.name) {
                            roomManager.getRoom(roomCode).saveName = linkedSave.name;
                        }
                    } catch (e) {
                        // non-fatal — saveName stays null
                    }
                }

                roomManager.joinLoadedRoom(roomCode, socket.id, hostName);
                if (data.secondName) {
                    try {
                        roomManager.joinLoadedRoom(roomCode, socket.id, data.secondName, socket.id + '_2');
                    } catch (innerError) {
                        roomManager.removeClientFromRoom(roomCode, socket.id);
                        throw innerError;
                    }
                }
                socket.join(roomCode);
                socket.currentRoom = roomCode;

                const room = roomManager.getRoom(roomCode);
                const player = room.players.find(p => p.id === socket.id);
                const player2 = data.secondName ? room.players.find(p => p.id === socket.id + '_2') : null;
                callback({ success: true, roomCode, playerId: player ? player.pId : null, secondPlayerId: player2 ? player2.pId : undefined });
                io.to(roomCode).emit('lobby_update', roomManager.getRoom(roomCode));
            } catch (e) {
                callback({ success: false, message: e.message });
            }
        });

        socket.on('join_loaded_game', (data, callback) => {
            try {
                const roomCode = data.roomCode;
                const room = roomManager.getRoom(roomCode);
                if (!room) return callback({ success: false, message: 'Room does not exist' });
                if (!room.isLoaded) return callback({ success: false, message: 'This is not a loaded game. Use regular join.' });

                roomManager.joinLoadedRoom(roomCode, socket.id, data.name);
                if (data.secondName) {
                    try {
                        roomManager.joinLoadedRoom(roomCode, socket.id, data.secondName, socket.id + '_2');
                    } catch (innerError) {
                        roomManager.removeClientFromRoom(roomCode, socket.id);
                        throw innerError;
                    }
                }
                socket.join(roomCode);
                socket.currentRoom = roomCode;

                const player = room.players.find(p => p.id === socket.id);
                const player2 = data.secondName ? room.players.find(p => p.id === socket.id + '_2') : null;
                callback({ success: true, playerId: player ? player.pId : null, secondPlayerId: player2 ? player2.pId : undefined });
                io.to(roomCode).emit('lobby_update', roomManager.getRoom(roomCode));
            } catch (e) {
                callback({ success: false, message: e.message });
            }
        });

        socket.on('resume_loaded_game', (callback) => {
            if (!socket.currentRoom) return callback({ success: false, message: 'Not in a room' });
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room || !room.isLoaded) return callback({ success: false, message: 'Not a loaded game room' });
            if (room.hostId !== socket.id) return callback({ success: false, message: 'Only host can resume' });
            if (room.players.length !== room.expectedNames.length) {
                return callback({ success: false, message: 'All ' + room.expectedNames.length + ' players must join before resuming. Currently: ' + room.players.length });
            }

            // Build name -> new socket ID mapping
            const nameToNewId = {};
            room.players.forEach(p => { nameToNewId[p.name] = p.id; });

            // Remap IDs in game state
            saveManager.remapPlayerIds(room.gameState, nameToNewId);
            room.gameState.confirmations = [];
            room.setupPhase = 'in_game';

            callback({ success: true });
            io.to(socket.currentRoom).emit('lobby_update', room);
            io.to(socket.currentRoom).emit('game_state_update', room.gameState);
        });

        socket.on('restart_toggle', (data) => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room)) return;
            if (!room) return;
            const playerId = data?.playerId || socket.id;
            const ownedSeats = room.socketSeats?.[socket.id];
            if (ownedSeats && !ownedSeats.includes(playerId)) return;
            const gs = room.gameState;
            if (!gs.restartApprovals) gs.restartApprovals = [];

            const idx = gs.restartApprovals.indexOf(playerId);
            if (idx === -1) {
                gs.restartApprovals.push(playerId);
            } else {
                gs.restartApprovals.splice(idx, 1);
                // Untoggling cancels host-confirming state
                if (gs.restartHostConfirming) gs.restartHostConfirming = false;
            }

            const totalActive = gs.players.filter(p => !p.inactive).length;
            if (gs.restartApprovals.length === totalActive && totalActive > 0) {
                gs.restartHostConfirming = true;
            }

            io.to(socket.currentRoom).emit('game_state_update', gs);
        });

        socket.on('restart_confirm', () => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (rejectIfStalled(socket, room)) return;
            if (!room || room.hostId !== socket.id) return;
            const gs = room.gameState;
            if (!gs.restartHostConfirming) return;

            const totalActive = gs.players.filter(p => !p.inactive).length;
            const allApproved = gs.players
                .filter(p => !p.inactive)
                .every(p => (gs.restartApprovals || []).includes(p.id));
            if (!allApproved) return;

            gs.restartCountdown = 5;
            io.to(socket.currentRoom).emit('game_state_update', gs);

            const roomCode = socket.currentRoom;
            const tick = setInterval(() => {
                const liveRoom = roomManager.getRoom(roomCode);
                if (!liveRoom) { clearInterval(tick); return; }
                const lgs = liveRoom.gameState;
                lgs.restartCountdown--;
                if (lgs.restartCountdown <= 0) {
                    clearInterval(tick);
                    const { restartGame } = require('./gameEngine');
                    restartGame(lgs);
                }
                io.to(roomCode).emit('game_state_update', lgs);
            }, 1000);
        });

        socket.on('restart_leave', () => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room) return;
            const gs = room.gameState;

            const leaverPlayer = gs.players.find(p => p.id === socket.id);
            const leaverName = leaverPlayer ? leaverPlayer.name : 'A player';

            roomManager.markPlayerInactive(socket.currentRoom, socket.id);
            gs.restartApprovals = [];
            gs.restartHostConfirming = false;
            gs.restartCountdown = null;
            gs.lastLeaver = { name: leaverName, id: socket.id, atGameOver: true };

            const roomCode = socket.currentRoom;
            socket.leave(roomCode);
            socket.currentRoom = null;
            io.to(roomCode).emit('lobby_update', room);
            io.to(roomCode).emit('game_state_update', gs);
        });

        socket.on('player_leave', (callback) => {
            if (!socket.currentRoom) return callback && callback({ success: false });
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room) return callback && callback({ success: false });

            const gs = room.gameState;
            const roomCode = socket.currentRoom;

            // Game already over — normal leave, no stall
            const gameOver = gs &&
                (gs.phase === 'end' || gs.phase === 'session_end') &&
                gs.sn >= gs.cfg.sessions;
            if (gameOver) {
                roomManager.markPlayerInactive(roomCode, socket.id);
                socket.leave(roomCode);
                socket.currentRoom = null;
                io.to(roomCode).emit('lobby_update', room);
                if (callback) callback({ success: true });
                return;
            }

            // Live game — mark seat as disconnected, held for rejoin
            roomManager.markPlayerDisconnected(roomCode, socket.id);
            socket.leave(roomCode);
            socket.currentRoom = null;
            if (callback) callback({ success: true });
            io.to(roomCode).emit('game_state_update', gs);
        });

        socket.on('disconnect', () => {
            // Silent disconnect — no fold, no inactive marker, no removal.
            // Player stays "active" in the game. When the tab comes back,
            // socket.io auto-reconnects and sync_reconnect remaps the ID.
            // Intentional leaves (leave_room, host_end_game) handle their own cleanup.
        });

        socket.on('sync_reconnect', (data, callback) => {
            const room = roomManager.getRoom(data.roomCode);
            if (!room) return callback({ success: false, reason: 'not_found' });

            const gs = room.gameState;

            // SOCKET ID REMAP — CRITICAL FOR RECONNECT
            // Every game-state structure keyed by or containing socket.id MUST be
            // remapped here. Omitting any will cause silent reconnect bugs that only
            // surface in specific phases (e.g., showdown approval lock from missing
            // potAward.eligibleIds remap).
            //
            // Currently remapped: gs.players[*].id, room.hostId, gs.hc/scores/origSt/rBets
            // keys, gs.ai array, gs.confirmations array, gs.restartApprovals array,
            // gs.history[*].wid/.net keys, gs.potAward.eligibleIds, gs.cp[*].eligible[*].id.
            //
            // When adding new game state with socket IDs, ADD THE REMAP BELOW.
            // Called once per seat — primary seat uses socket.id, secondary uses socket.id + '_2'.
            function remapId(oldId, newId) {
                const p = room.players.find(p => p.id === oldId);
                if (!p) return;
                p.id = newId;
                if (room.hostId === oldId) room.hostId = newId;
                if (!gs || !gs.players) return;

                const gp = gs.players.find(p => p.id === oldId);
                if (gp) gp.id = newId;

                const remapKey = (obj) => {
                    if (obj && obj[oldId] !== undefined) { obj[newId] = obj[oldId]; delete obj[oldId]; }
                };
                remapKey(gs.hc);
                remapKey(gs.scores);
                remapKey(gs.origSt);
                remapKey(gs.rBets);

                const remapArr = (arr) => {
                    if (arr) for (let i = 0; i < arr.length; i++) if (arr[i] === oldId) arr[i] = newId;
                };
                remapArr(gs.ai);
                remapArr(gs.confirmations);
                remapArr(gs.restartApprovals);

                if (gs.history) {
                    gs.history.forEach(h => {
                        if (h.wid === oldId) h.wid = newId;
                        if (h.net && h.net[oldId] !== undefined) { h.net[newId] = h.net[oldId]; delete h.net[oldId]; }
                        if (h.stacks && h.stacks[oldId] !== undefined) { h.stacks[newId] = h.stacks[oldId]; delete h.stacks[oldId]; }
                        if (h.playerNames && h.playerNames[oldId] !== undefined) { h.playerNames[newId] = h.playerNames[oldId]; delete h.playerNames[oldId]; }
                    });
                }

                if (gs.potAward && gs.potAward.eligibleIds) {
                    gs.potAward.eligibleIds = gs.potAward.eligibleIds.map(id => id === oldId ? newId : id);
                }

                if (gs.cp) {
                    gs.cp.forEach(pot => {
                        if (pot.eligible) pot.eligible.forEach(ep => { if (ep.id === oldId) ep.id = newId; });
                    });
                }
            }

            // Find and remap primary seat
            let player = null;
            if (data.playerId) player = room.players.find(p => p.pId === data.playerId);
            if (!player && data.playerName) player = room.players.find(p => p.name === data.playerName);
            if (!player) return callback({ success: false, reason: 'not_found' });

            const primaryPId = player.pId;
            remapId(player.id, socket.id);
            const rejoinGp = gs?.players?.find(p => p.id === socket.id);
            if (rejoinGp) rejoinGp.disconnected = false;
            const rejoinRp = room.players.find(p => p.id === socket.id);
            if (rejoinRp) rejoinRp.disconnected = false;

            // Find and remap secondary seat (dual-seat device)
            let secondaryPId = null;
            if (data.secondPId || data.secondName) {
                let player2 = null;
                if (data.secondPId) player2 = room.players.find(p => p.pId === data.secondPId);
                if (!player2 && data.secondName) player2 = room.players.find(p => p.name === data.secondName);
                if (player2) {
                    secondaryPId = player2.pId;
                    remapId(player2.id, socket.id + '_2');
                    const rejoinGp2 = gs?.players?.find(p => p.id === socket.id + '_2');
                    if (rejoinGp2) rejoinGp2.disconnected = false;
                    const rejoinRp2 = room.players.find(p => p.id === socket.id + '_2');
                    if (rejoinRp2) rejoinRp2.disconnected = false;
                }
            }

            // Rebuild socketSeats for this socket from scratch
            room.socketSeats[socket.id] = secondaryPId
                ? [socket.id, socket.id + '_2']
                : [socket.id];

            // Re-join the socket room (disconnect auto-leaves)
            socket.join(data.roomCode);
            socket.currentRoom = data.roomCode;

            // Sync state back — always send both so client knows where it is
            socket.emit('lobby_update', room);
            if (gs) socket.emit('game_state_update', gs);
            callback({ success: true, playerId: primaryPId, secondPlayerId: secondaryPId || undefined, inGame: room.setupPhase === 'in_game' });
        });
    });
};
