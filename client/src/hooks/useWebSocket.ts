import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/api";

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = () => {
    const token = getAuthToken();
    if (!token) {
      console.log("[WS Client] No token, cannot connect");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log("[WS Client] Connecting to:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS Client] Connected, authenticating...");
      setIsConnected(true);
      // Authenticate with token
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("[WS Client] Received message:", message);
        setLastMessage(message);
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    };

    ws.onclose = () => {
      console.log("[WS Client] Disconnected, reconnecting in 3s...");
      setIsConnected(false);
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
      console.error("[WS Client] Error:", error);
    };
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const sendMessage = (message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[WS Client] Sending message:", message);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.log("[WS Client] Cannot send, not connected. State:", wsRef.current?.readyState);
    }
  };

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  return {
    isConnected,
    lastMessage,
    sendMessage,
  };
}
