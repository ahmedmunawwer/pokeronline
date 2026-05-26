const activeRooms = new Map(); // key: digit (1-9), value: room object

function getAvailableDigit() {
    for (let i = 1; i <= 9; i++) {
        if (!activeRooms.has(i.toString())) {
            return i.toString();
        }
    }
    return null; // All 9 digits are in use
}

function getAvailableTwoDigit() {
    for (let i = 10; i <= 99; i++) {
        if (!activeRooms.has(i.toString())) {
            return i.toString();
        }
    }
    return null;
}

function createRoom(preferredCode) {
    let roomCode;
    if (preferredCode !== undefined && preferredCode !== null && preferredCode !== '') {
        const code = String(preferredCode).trim();
        if (!/^[1-9]$/.test(code)) throw new Error("Room code must be a single digit 1–9");
        if (activeRooms.has(code)) throw new Error("Room code " + code + " is already in use — pick another");
        roomCode = code;
    } else {
        roomCode = getAvailableDigit();
        if (!roomCode) throw new Error("Servers Full");
    }

    activeRooms.set(roomCode, {
        createdAt: Date.now(),
        hostId: null,
        maxPlayers: 6,
        equalStack: true,
        setupPhase: 'waiting', // waiting, configuring, countdown, in_game
        players: [], // { id, name, ready, stack, isHost }
        sockets: new Set(),
        socketSeats: {},
        gameState: {
            phase: "lobby", // "lobby", "menu" (setup), "preflop", etc.
            players: [],
            cfg: null,
            pot: 0,
            cp: [], // side pots
            dealer: 0,
            actI: 0,
            queue: [],
            hc: {}, // hole card chips committed
            ai: [], // all-in player IDs
            rBets: {}, // round bets
            curBet: 0,
            lr: 0,
            lfb: 0,
            scores: {},
            history: [],
            undoStack: [],
            pi: 0,
            hn: 0,
            sn: 1,
            log: [],
            curActs: []
        }
    });

    return roomCode;
}

function joinRoom(roomCode, socketId, name, isHost = false, maxPlayers = 6, equalStack = true, virtualId = null) {
    const room = activeRooms.get(roomCode);
    if (!room) throw new Error("Room does not exist");
    if (room.setupPhase !== 'waiting') throw new Error("Game already in progress");
    if (room.players.length >= room.maxPlayers && !isHost) throw new Error("Room is full");
    if (!virtualId && room.players.find(p => p.id === socketId)) return; // Already joined (first seat)

    // Check for duplicate names
    const trimmedName = (name || '').trim();
    if (room.players.find(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        throw new Error("Name '" + trimmedName + "' is already taken. Please choose a different name.");
    }

    if (isHost) {
        room.hostId = socketId;
        room.maxPlayers = maxPlayers;
        room.equalStack = equalStack;
    }

    const playerId = virtualId || socketId;
    room.players.push({
        id: playerId,
        name: trimmedName || `Player ${room.players.length + 1}`,
        pId: playerId + '_' + Date.now(),
        ready: isHost,
        stack: 0,
        isHost: isHost
    });
    room.sockets.add(socketId);
    if (!room.socketSeats[socketId]) room.socketSeats[socketId] = [];
    room.socketSeats[socketId].push(playerId);
}

function createLoadedRoom(saveData) {
    const roomCode = getAvailableTwoDigit();
    if (!roomCode) throw new Error("No available room codes for loaded games");

    activeRooms.set(roomCode, {
        createdAt: Date.now(),
        hostId: null,
        maxPlayers: saveData.playerCount,
        equalStack: true,
        setupPhase: 'loaded_waiting',
        players: [],
        sockets: new Set(),
        socketSeats: {},
        gameState: JSON.parse(JSON.stringify(saveData.gameState)),
        expectedNames: saveData.playerNames,
        isLoaded: true,
        saveId: saveData.saveId
    });

    return roomCode;
}

function joinLoadedRoom(roomCode, socketId, name, virtualId = null) {
    const room = activeRooms.get(roomCode);
    if (!room) throw new Error("Room does not exist");
    if (!room.isLoaded) throw new Error("This is not a loaded game room");
    if (room.setupPhase !== 'loaded_waiting') throw new Error("Game already resumed");
    if (!virtualId && room.players.find(p => p.id === socketId)) return;

    const trimmedName = (name || '').trim();

    // Check name is one of the expected players
    const nameMatch = room.expectedNames.find(n => n.toLowerCase() === trimmedName.toLowerCase());
    if (!nameMatch) {
        throw new Error("Name '" + trimmedName + "' was not in the original game. Expected: " + room.expectedNames.join(", "));
    }

    // Check name not already joined
    if (room.players.find(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        throw new Error("A player named '" + trimmedName + "' has already joined.");
    }

    const isHost = room.players.length === 0 && !virtualId; // First real seat is host
    if (isHost) {
        room.hostId = socketId;
    }

    const playerId = virtualId || socketId;
    room.players.push({
        id: playerId,
        name: nameMatch, // Use exact case from save
        pId: playerId + '_' + Date.now(),
        ready: true,
        stack: 0,
        isHost: isHost
    });
    room.sockets.add(socketId);
    if (!room.socketSeats[socketId]) room.socketSeats[socketId] = [];
    room.socketSeats[socketId].push(playerId);
}

function setPlayerReady(roomCode, playerId, ready) {
    const room = activeRooms.get(roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.ready = ready;
}

function getRoom(digit) {
    return activeRooms.get(digit);
}

function deleteRoom(digit) {
    activeRooms.delete(digit);
}

function addClientToRoom(digit, socketId) {
    const room = activeRooms.get(digit);
    if (room) {
        room.sockets.add(socketId);
    }
}

function removeClientFromRoom(roomCode, socketId) {
    const room = activeRooms.get(roomCode);
    if (!room) return;

    // If game hasn't started, remove from lobby array
    if (room.setupPhase !== 'in_game') {
        const seatIds = room.socketSeats[socketId] || [socketId];
        room.players = room.players.filter(p => !seatIds.includes(p.id));
        delete room.socketSeats[socketId];
        room.sockets.delete(socketId);
        if (room.players.length === 0) {
            deleteRoom(roomCode);
        } else if (room.hostId === socketId) {
            room.hostId = room.players[0].id;
            room.players[0].isHost = true;
            room.players[0].ready = true;
        }
    } else {
        // Game is in progress, mark as inactive
        const player = room.players.find(p => p.id === socketId);
        if (player) {
            player.inactive = true;
            player.ready = false;
        }
        room.sockets.delete(socketId);
    }
}

function markPlayerInactive(roomCode, socketId) {
    const room = activeRooms.get(roomCode);
    if (!room) return;
    const seatIds = room.socketSeats[socketId] || [socketId];
    for (const seatId of seatIds) {
        const player = room.players.find(p => p.id === seatId);
        if (player) player.inactive = true;
        if (room.gameState && room.gameState.players) {
            const gp = room.gameState.players.find(p => p.id === seatId);
            if (gp) gp.inactive = true;
        }
    }
    room.sockets.delete(socketId);
}

function getRoomCodeSuggestions() {
    // Next available host code: lowest unused single digit
    let nextAvailableHostCode = null;
    for (let i = 1; i <= 9; i++) {
        if (!activeRooms.has(i.toString())) {
            nextAvailableHostCode = i.toString();
            break;
        }
    }

    // Latest joinee code: single-digit room with the most recent createdAt
    let latestJoineeCode = null;
    let latestTime = -1;
    for (const [code, room] of activeRooms) {
        if (/^[1-9]$/.test(code) && room.createdAt > latestTime) {
            latestTime = room.createdAt;
            latestJoineeCode = code;
        }
    }

    return { nextAvailableHostCode, latestJoineeCode };
}

module.exports = {
    createRoom,
    createLoadedRoom,
    joinRoom,
    joinLoadedRoom,
    setPlayerReady,
    getRoomCodeSuggestions,
    getRoom,
    deleteRoom,
    addClientToRoom,
    removeClientFromRoom,
    markPlayerInactive
};
