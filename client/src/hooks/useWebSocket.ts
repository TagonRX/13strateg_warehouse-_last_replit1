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
      console.log("[WS Client] No token, skipping connection");
      setIsConnected(false);
      // Don't reconnect if no token
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log("[WS Client] Connecting to:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS Client] Connected, authenticating...");
      // Don't set connected until auth succeeds
      ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("[WS Client] Received message:", message);
        
        // Set connected only after successful auth
        if (message.type === "auth_success") {
          setIsConnected(true);
        } else if (message.type === "auth_error") {
          console.error("[WS Client] Auth failed:", message.error);
          ws.close();
          setIsConnected(false);
        }
        
        setLastMessage(message);
      } catch (error) {
        console.error("WebSocket message parse error:", error);
      }
    };

    ws.onclose = () => {
      console.log("[WS Client] Disconnected");
      setIsConnected(false);
      
      // Only reconnect if we have a token
      const currentToken = getAuthToken();
      if (currentToken) {
        console.log("[WS Client] Reconnecting in 3s...");
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      } else {
        console.log("[WS Client] No token, won't reconnect");
      }
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
