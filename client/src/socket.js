import { io } from 'socket.io-client';

const socket = io(import.meta.env.MODE === 'production' ? '/' : 'http://localhost:3000');
export default socket;
