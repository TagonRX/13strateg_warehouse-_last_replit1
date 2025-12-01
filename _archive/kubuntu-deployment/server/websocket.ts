import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getSession } from "./auth";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, Set<AuthenticatedWebSocket>>();

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
          const userClients = clients.get(ws.userId);
          if (userClients) {
            userClients.delete(ws);
            if (userClients.size === 0) {
              clients.delete(ws.userId);
            }
          }
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
    console.log("[WS] New connection from:", req.socket.remoteAddress);
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
            
            // Add this WebSocket to the user's set of connections
            let userClients = clients.get(session.userId);
            if (!userClients) {
              userClients = new Set();
              clients.set(session.userId, userClients);
            }
            userClients.add(ws);
            
            console.log(`[WS] User ${session.userId} authenticated, total devices: ${userClients.size}`);
            
            ws.send(JSON.stringify({ 
              type: "auth_success",
              userId: session.userId 
            }));
          } else {
            console.log("[WS] Authentication failed: Invalid token");
            ws.send(JSON.stringify({ 
              type: "auth_error",
              error: "Invalid token" 
            }));
            ws.close();
          }
        }

        // Remote scan message from phone
        if (message.type === "remote_scan" && ws.userId) {
          const { barcode, qty } = message;
          const quantity = qty || 1; // Default to 1 if not provided
          
          console.log(`[WS] Remote scan from user ${ws.userId}: ${barcode} (qty: ${quantity})`);
          
          // Send to all other devices of the same user
          const userClients = clients.get(ws.userId);
          if (userClients) {
            let sentCount = 0;
            userClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "barcode_scanned",
                  barcode,
                  qty: quantity
                }));
                sentCount++;
              }
            });
            console.log(`[WS] Sent barcode to ${sentCount} other device(s)`);
          }
        }

        // Sync picking list selection across devices
        if (message.type === "sync_picking_list" && ws.userId) {
          const { listId } = message;
          
          console.log(`[WS] Syncing picking list ${listId} for user ${ws.userId}`);
          
          // Send to all other devices of the same user
          const userClients = clients.get(ws.userId);
          if (userClients) {
            let sentCount = 0;
            userClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "sync_picking_list",
                  listId
                }));
                sentCount++;
              }
            });
            console.log(`[WS] Synced picking list to ${sentCount} other device(s)`);
          }
        }

        // Scan mode toggle (phone becomes scanner, desktop receives)
        if (message.type === "scanner_mode" && ws.userId) {
          const { enabled } = message;
          
          // Notify all other devices of this user about scanner mode
          const userClients = clients.get(ws.userId);
          if (userClients) {
            userClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "scanner_mode_update",
                  enabled
                }));
              }
            });
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
          }
        }
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
          }
        }
      }
    });
  });

  return wss;
}
