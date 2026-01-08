import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});
app.use("/uploads", express.static(uploadDir));

const state = {
  users: new Map(),
  tokens: new Map(),
  rooms: new Map(),
  messages: new Map()
};

function createId() {
  return crypto.randomUUID();
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !state.tokens.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = state.tokens.get(token);
  return next();
}

app.post("/api/register", (req, res) => {
  const { username } = req.body || {};
  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username is required" });
  }
  const userId = createId();
  const token = createId();
  const user = { id: userId, username };
  state.users.set(userId, user);
  state.tokens.set(token, user);
  return res.json({ userId, username, token });
});

app.get("/api/rooms", authMiddleware, (req, res) => {
  const rooms = Array.from(state.rooms.values()).map((room) => ({
    id: room.id,
    name: room.name,
    channels: room.channels
  }));
  res.json({ rooms });
});

app.post("/api/rooms", authMiddleware, (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Room name is required" });
  }
  const roomId = createId();
  const room = {
    id: roomId,
    name,
    channels: []
  };
  state.rooms.set(roomId, room);
  res.status(201).json(room);
});

app.get("/api/rooms/:roomId/channels", authMiddleware, (req, res) => {
  const room = state.rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json({ channels: room.channels });
});

app.post("/api/rooms/:roomId/channels", authMiddleware, (req, res) => {
  const { name, type } = req.body || {};
  const room = state.rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Channel name is required" });
  }
  if (!type || !["text", "voice"].includes(type)) {
    return res.status(400).json({ error: "Channel type must be text or voice" });
  }
  const channel = { id: createId(), name, type };
  room.channels.push(channel);
  res.status(201).json(channel);
});

app.get("/api/rooms/:roomId/channels/:channelId/messages", authMiddleware, (req, res) => {
  const key = `${req.params.roomId}:${req.params.channelId}`;
  const messages = state.messages.get(key) || [];
  res.json({ messages });
});

app.post("/api/rooms/:roomId/channels/:channelId/messages", authMiddleware, (req, res) => {
  const { text, emoji, attachments } = req.body || {};
  if (!text && !emoji && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ error: "Message content is required" });
  }
  const key = `${req.params.roomId}:${req.params.channelId}`;
  const messages = state.messages.get(key) || [];
  const message = {
    id: createId(),
    user: req.user,
    text: text || "",
    emoji: emoji || "",
    attachments: attachments || [],
    createdAt: new Date().toISOString()
  };
  messages.push(message);
  state.messages.set(key, messages);
  broadcastToRoom(req.params.roomId, {
    type: "chat",
    roomId: req.params.roomId,
    channelId: req.params.channelId,
    message
  });
  res.status(201).json(message);
});

app.post("/api/uploads", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File required" });
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, originalName: req.file.originalname });
});

const clients = new Map();

function broadcastToRoom(roomId, payload) {
  const message = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.roomId === roomId && client.ws.readyState === 1) {
      client.ws.send(message);
    }
  }
}

function broadcastToChannel(roomId, channelId, payload) {
  const message = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.roomId === roomId && client.channelId === channelId && client.ws.readyState === 1) {
      client.ws.send(message);
    }
  }
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const user = token ? state.tokens.get(token) : null;
  if (!user) {
    ws.close();
    return;
  }
  const clientId = createId();
  const client = { id: clientId, ws, user, roomId: null, channelId: null };
  clients.set(clientId, client);

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch (error) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (data.type === "join") {
      client.roomId = data.roomId || null;
      client.channelId = data.channelId || null;
      ws.send(JSON.stringify({ type: "joined", roomId: client.roomId, channelId: client.channelId }));
      return;
    }

    if (data.type === "signal") {
      if (!client.roomId) {
        ws.send(JSON.stringify({ type: "error", message: "Join a room first" }));
        return;
      }
      broadcastToChannel(client.roomId, data.channelId, {
        type: "signal",
        from: client.user,
        channelId: data.channelId,
        payload: data.payload
      });
      return;
    }

    ws.send(JSON.stringify({ type: "error", message: "Unknown message" }));
  });

  ws.on("close", () => {
    clients.delete(clientId);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${PORT}`);
});
