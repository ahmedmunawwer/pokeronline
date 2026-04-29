const roomManager = require('./roomManager');
const saveManager = require('./saveManager');

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

module.exports = function(io) {
    io.on('connection', (socket) => {
        
        socket.on('host_game', (data, callback) => {
            try {
                const roomCode = roomManager.createRoom(data.roomCode);
                socket.join(roomCode);
                socket.currentRoom = roomCode;
                
                roomManager.joinRoom(roomCode, socket.id, data.name, true, data.maxPlayers, data.equalStack);
                
                callback({ success: true, roomCode });
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
                
                callback({ success: true });
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
                callback({ name: "Joinee 1", existingNames: [] });
                return;
            }
            room.joineeCounter = (room.joineeCounter || 0) + 1;
            const existingNames = room.players.map(p => p.name);
            callback({ name: "Joinee " + room.joineeCounter, existingNames });
        });

        socket.on('set_ready', (ready) => {
            if (!socket.currentRoom) return;
            roomManager.setPlayerReady(socket.currentRoom, socket.id, ready);
            io.to(socket.currentRoom).emit('lobby_update', roomManager.getRoom(socket.currentRoom));
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
            if (!room || room.hostId !== socket.id) return;

            room.setupPhase = 'countdown';
            room.settings = settings; // Store settings to broadcast
            io.to(socket.currentRoom).emit('lobby_update', room);

            // 5 second countdown before actual game start
            setTimeout(() => {
                const liveRoom = roomManager.getRoom(socket.currentRoom);
                if (!liveRoom) return;

                liveRoom.setupPhase = 'in_game';
                
                const { startHand } = require('./gameEngine');
                liveRoom.gameState.cfg = settings.cfg;
                
                // Construct players array for gameEngine
                const gamePlayers = liveRoom.players.map((p, i) => ({
                    id: p.id,
                    name: p.name,
                    stack: settings.stacks[p.id],
                    folded: false
                }));
                liveRoom.gameState.players = gamePlayers;
                
                const os = {}, is = {};
                gamePlayers.forEach((p) => { 
                    os[p.id] = p.stack; 
                    is[p.id] = 0; 
                });
                liveRoom.gameState.origSt = os;
                liveRoom.gameState.scores = is;
                
                startHand(liveRoom.gameState);
                io.to(socket.currentRoom).emit('lobby_update', liveRoom);
                io.to(socket.currentRoom).emit('game_state_update', liveRoom.gameState);
            }, 5000);
        });

        socket.on('player_action', (data) => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
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
            
            const phaseBefore = gs.phase;
            processAction(gs, data);

            // Record hand history when transitioning INTO 'end' or 'session_end'
            if ((gs.phase === 'end' || gs.phase === 'session_end') &&
                phaseBefore !== 'end' && phaseBefore !== 'session_end') {
                gs.confirmations = [];
                const net = {};
                const baseStacks = gs.stacksBefore || stacksBefore;
                gs.players.forEach(p => { net[p.id] = p.stack - (baseStacks[p.id] || 0); });
                const wiPlayer = gs.wi ? gs.players.find(p => p.name === gs.wi.name) : null;
                const histRecord = {
                    sn: gs.sn,
                    hn: gs.hn,
                    wid: wiPlayer ? wiPlayer.id : null,
                    wname: gs.wi ? gs.wi.name : null,
                    hr: gs.wi ? gs.wi.hr : null,
                    net: net,
                    acts: gs.curActs || []
                };
                if (!gs.history) gs.history = [];
                gs.history.push(histRecord);
            }

            io.to(socket.currentRoom).emit('game_state_update', gs);
        });

        socket.on('confirm_result', () => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room) return;
            const gs = room.gameState;
            if (!gs.confirmations) gs.confirmations = [];
            if (!gs.confirmations.includes(socket.id)) {
                gs.confirmations.push(socket.id);
            }
            io.to(socket.currentRoom).emit('game_state_update', gs);
        });

        socket.on('dissent_result', () => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
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

        socket.on('host_end_game', (data, callback) => {
            if (!socket.currentRoom) return callback && callback({ success: false });
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room || room.hostId !== socket.id) return callback && callback({ success: false });

            const roomCode = socket.currentRoom;

            // Optionally save before ending
            if (data && data.save) {
                try {
                    saveManager.saveGame(room.gameState, room.players);
                } catch (e) { /* silent fail */ }
            }

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

        // --- Save / Load ---
        socket.on('save_game', (callback) => {
            if (!socket.currentRoom) return callback({ success: false, message: 'Not in a room' });
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room || room.hostId !== socket.id) return callback({ success: false, message: 'Only host can save' });
            try {
                const saveId = saveManager.saveGame(room.gameState, room.players);
                callback({ success: true, saveId });
            } catch (e) {
                callback({ success: false, message: e.message });
            }
        });

        socket.on('list_saves', (callback) => {
            try {
                const saves = saveManager.listSaves();
                callback({ success: true, saves });
            } catch (e) {
                callback({ success: false, saves: [], message: e.message });
            }
        });

        socket.on('load_game', (data, callback) => {
            try {
                const save = saveManager.loadSave(data.saveId);
                if (!save) return callback({ success: false, message: 'Save not found' });

                // Validate host name
                const hostName = (data.hostName || '').trim();
                const nameMatch = save.playerNames.find(n => n.toLowerCase() === hostName.toLowerCase());
                if (!nameMatch) {
                    return callback({ success: false, message: "Name '" + hostName + "' was not in the original game. Expected: " + save.playerNames.join(", ") });
                }

                const roomCode = roomManager.createLoadedRoom(save);
                // Host joins the loaded room
                roomManager.joinLoadedRoom(roomCode, socket.id, hostName);
                socket.join(roomCode);
                socket.currentRoom = roomCode;

                callback({ success: true, roomCode });
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
                socket.join(roomCode);
                socket.currentRoom = roomCode;

                callback({ success: true });
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

        socket.on('restart_toggle', () => {
            if (!socket.currentRoom) return;
            const room = roomManager.getRoom(socket.currentRoom);
            if (!room) return;
            const gs = room.gameState;
            if (!gs.restartApprovals) gs.restartApprovals = [];

            const idx = gs.restartApprovals.indexOf(socket.id);
            if (idx === -1) {
                gs.restartApprovals.push(socket.id);
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

        socket.on('disconnect', () => {
            if (socket.currentRoom) {
                const room = roomManager.getRoom(socket.currentRoom);
                if (room && room.setupPhase === 'in_game') {
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
                    io.to(socket.currentRoom).emit('lobby_update', room);
                    io.to(socket.currentRoom).emit('game_state_update', gs);
                } else {
                    roomManager.removeClientFromRoom(socket.currentRoom, socket.id);
                    const updatedRoom = roomManager.getRoom(socket.currentRoom);
                    if (updatedRoom) io.to(socket.currentRoom).emit('lobby_update', updatedRoom);
                }
            }
        });
    });
};
