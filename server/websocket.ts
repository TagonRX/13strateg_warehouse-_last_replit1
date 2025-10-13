import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getSession } from "./auth";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, AuthenticatedWebSocket>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: "/ws"
  });

  // Heartbeat to detect disconnected clients
  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (ws.isAlive === false) {
        if (ws.userId) {
          clients.delete(ws.userId);
        }
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  wss.on("connection", (ws: AuthenticatedWebSocket, req) => {
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Authentication message
        if (message.type === "auth") {
          const token = message.token;
          const session = getSession(token);
          
          if (session) {
            ws.userId = session.userId;
            
            // Remove old connection for this user if exists
            const oldConnection = clients.get(session.userId);
            if (oldConnection && oldConnection !== ws) {
              oldConnection.close();
            }
            
            clients.set(session.userId, ws);
            
            ws.send(JSON.stringify({ 
              type: "auth_success",
              userId: session.userId 
            }));
          } else {
            ws.send(JSON.stringify({ 
              type: "auth_error",
              error: "Invalid token" 
            }));
            ws.close();
          }
        }

        // Remote scan message from phone
        if (message.type === "remote_scan" && ws.userId) {
          const { barcode } = message;
          
          // Send to the same user's other devices
          const client = clients.get(ws.userId);
          if (client && client !== ws) {
            client.send(JSON.stringify({
              type: "barcode_scanned",
              barcode
            }));
          }
        }

        // Scan mode toggle (phone becomes scanner, desktop receives)
        if (message.type === "scanner_mode" && ws.userId) {
          const { enabled } = message;
          
          // Notify all devices of this user about scanner mode
          const client = clients.get(ws.userId);
          if (client) {
            client.send(JSON.stringify({
              type: "scanner_mode_update",
              enabled
            }));
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      if (ws.userId) {
        const client = clients.get(ws.userId);
        if (client === ws) {
          clients.delete(ws.userId);
        }
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      if (ws.userId) {
        clients.delete(ws.userId);
      }
    });
  });

  return wss;
}
