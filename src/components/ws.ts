let ws: WebSocket | null = null;

export function getWebSocket(): WebSocket {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    ws = new WebSocket('ws://localhost:8080/ws');

    ws.onopen = () => console.log('✅ WS connected');
    ws.onerror = (e) => console.error('❌ WS error:', e);
    ws.onclose = () => console.warn('🔌 WS closed');
  }

  return ws;
}

export function sendMessage(data: any) {
  const socket = getWebSocket();
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  } else {
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify(data));
    });
  }
}
