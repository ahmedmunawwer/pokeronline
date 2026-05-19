import { io } from 'socket.io-client';

const socket = io(
  import.meta.env.MODE === 'production' ? '/' : 'http://192.168.1.188:3000',
  {
    reconnection: true,
    reconnectionDelay: 300,
    reconnectionDelayMax: 1500,
    reconnectionAttempts: Infinity,
    timeout: 20000,
    transports: ['websocket', 'polling'],
    upgrade: true,
    rememberUpgrade: false,
  }
);

export default socket;
