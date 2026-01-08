const params = new URLSearchParams(window.location.search);
const API_BASE = params.get("api") || window.location.origin;
let authToken = "";
let currentUser = null;
let currentRoom = null;
let currentChannel = null;
let ws = null;
let localStream = null;
let screenStream = null;
const peers = new Map();

const statusEl = document.getElementById("status");
const usernameEl = document.getElementById("username");
const tokenEl = document.getElementById("token");
const roomsEl = document.getElementById("rooms");
const channelsEl = document.getElementById("channels");
const chatEl = document.getElementById("chat");
const mediaEl = document.getElementById("media");

function setStatus(message) {
  statusEl.textContent = message;
}

function setAuth(token, user) {
  authToken = token;
  currentUser = user;
  tokenEl.value = token;
  setStatus(`Подключено как ${user.username}`);
  connectWebSocket();
}

function authHeaders() {
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json"
  };
}

async function register() {
  const username = usernameEl.value.trim();
  if (!username) {
    alert("Введите имя пользователя");
    return;
  }
  const response = await fetch(`${API_BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
  const data = await response.json();
  setAuth(data.token, { id: data.userId, username: data.username });
  await loadRooms();
}

async function applyToken() {
  const token = tokenEl.value.trim();
  if (!token) {
    alert("Введите токен");
    return;
  }
  authToken = token;
  setStatus("Токен применен");
  connectWebSocket();
  await loadRooms();
}

async function loadRooms() {
  if (!authToken) return;
  const response = await fetch(`${API_BASE}/api/rooms`, { headers: authHeaders() });
  const data = await response.json();
  roomsEl.innerHTML = "";
  data.rooms.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.name;
    roomsEl.appendChild(option);
  });
  if (data.rooms.length > 0) {
    currentRoom = data.rooms[0];
    await loadChannels();
  }
}

async function createRoom() {
  const name = document.getElementById("roomName").value.trim();
  if (!name) return;
  await fetch(`${API_BASE}/api/rooms`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name })
  });
  await loadRooms();
}

async function loadChannels() {
  const roomId = roomsEl.value;
  if (!roomId) return;
  const response = await fetch(`${API_BASE}/api/rooms/${roomId}/channels`, { headers: authHeaders() });
  const data = await response.json();
  channelsEl.innerHTML = "";
  data.channels.forEach((channel) => {
    const option = document.createElement("option");
    option.value = channel.id;
    option.textContent = `${channel.name} (${channel.type})`;
    option.dataset.type = channel.type;
    channelsEl.appendChild(option);
  });
}

async function createChannel() {
  const roomId = roomsEl.value;
  const name = document.getElementById("channelName").value.trim();
  const type = document.getElementById("channelType").value;
  if (!roomId || !name) return;
  await fetch(`${API_BASE}/api/rooms/${roomId}/channels`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, type })
  });
  await loadChannels();
}

async function joinChannel() {
  const roomId = roomsEl.value;
  const channelId = channelsEl.value;
  if (!roomId || !channelId) return;
  currentRoom = roomId;
  currentChannel = channelId;
  chatEl.innerHTML = "";
  await loadMessages();
  sendWs({ type: "join", roomId, channelId });
}

async function loadMessages() {
  if (!currentRoom || !currentChannel) return;
  const response = await fetch(
    `${API_BASE}/api/rooms/${currentRoom}/channels/${currentChannel}/messages`,
    { headers: authHeaders() }
  );
  const data = await response.json();
  chatEl.innerHTML = "";
  data.messages.forEach(addChatMessage);
}

async function sendMessage(emoji = "") {
  const text = document.getElementById("message").value.trim();
  if (!currentRoom || !currentChannel) return;
  const response = await fetch(
    `${API_BASE}/api/rooms/${currentRoom}/channels/${currentChannel}/messages`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ text, emoji })
    }
  );
  if (!response.ok) return;
  document.getElementById("message").value = "";
}

async function uploadImage() {
  if (!currentRoom || !currentChannel) return;
  const file = document.getElementById("file").files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData
  });
  const data = await response.json();
  await fetch(`${API_BASE}/api/rooms/${currentRoom}/channels/${currentChannel}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ attachments: [data.url] })
  });
  document.getElementById("file").value = "";
}

function addChatMessage(message) {
  const entry = document.createElement("div");
  entry.className = "chat-entry";
  const header = document.createElement("span");
  header.textContent = message.user?.username || "Anon";
  entry.appendChild(header);
  if (message.text) {
    const text = document.createElement("div");
    text.textContent = message.text;
    entry.appendChild(text);
  }
  if (message.emoji) {
    const emoji = document.createElement("div");
    emoji.textContent = message.emoji;
    entry.appendChild(emoji);
  }
  if (message.attachments && message.attachments.length > 0) {
    message.attachments.forEach((url) => {
      const img = document.createElement("img");
      img.src = `${API_BASE}${url}`;
      entry.appendChild(img);
    });
  }
  chatEl.appendChild(entry);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function connectWebSocket() {
  if (!authToken) return;
  if (ws) {
    ws.close();
  }
  ws = new WebSocket(`${API_BASE.replace("http", "ws")}/ws?token=${authToken}`);
  ws.addEventListener("open", () => {
    setStatus("WebSocket подключен");
  });
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "chat") {
      addChatMessage(data.message);
    }
    if (data.type === "signal") {
      handleSignal(data);
    }
  });
  ws.addEventListener("close", () => {
    setStatus("WebSocket отключен");
  });
}

function sendWs(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function joinVoice() {
  if (!currentRoom || !currentChannel) {
    alert("Выберите канал");
    return;
  }
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  attachMedia(localStream, "Микрофон");
  sendWs({ type: "join", roomId: currentRoom, channelId: currentChannel });
  sendWs({ type: "signal", channelId: currentChannel, payload: { type: "ready" } });
}

async function shareScreen() {
  if (!currentRoom || !currentChannel) return;
  screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  attachMedia(screenStream, "Экран", true);
  peers.forEach((peer) => {
    screenStream.getTracks().forEach((track) => peer.addTrack(track, screenStream));
  });
  sendWs({ type: "signal", channelId: currentChannel, payload: { type: "ready" } });
}

function attachMedia(stream, label, isVideo = false) {
  const wrapper = document.createElement("div");
  const title = document.createElement("div");
  title.textContent = label;
  wrapper.appendChild(title);
  const element = document.createElement(isVideo ? "video" : "audio");
  element.autoplay = true;
  element.controls = true;
  element.srcObject = stream;
  wrapper.appendChild(element);
  mediaEl.appendChild(wrapper);
}

function stopVoice() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
  }
  peers.forEach((peer) => peer.close());
  peers.clear();
  mediaEl.innerHTML = "";
}

function createPeerConnection(remoteId) {
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      sendWs({
        type: "signal",
        channelId: currentChannel,
        payload: { type: "candidate", candidate: event.candidate, targetId: remoteId }
      });
    }
  };
  peer.ontrack = (event) => {
    attachMedia(event.streams[0], `Поток ${remoteId}`, true);
  };
  if (localStream) {
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  }
  if (screenStream) {
    screenStream.getTracks().forEach((track) => peer.addTrack(track, screenStream));
  }
  peers.set(remoteId, peer);
  return peer;
}

async function handleSignal({ from, payload }) {
  if (!payload) return;
  if (payload.targetId && currentUser && payload.targetId !== currentUser.id) {
    return;
  }
  if (!from || (currentUser && from.id === currentUser.id)) {
    return;
  }
  const remoteId = from.id;
  let peer = peers.get(remoteId);

  if (payload.type === "ready") {
    if (!peer) {
      peer = createPeerConnection(remoteId);
    }
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendWs({
      type: "signal",
      channelId: currentChannel,
      payload: { type: "offer", sdp: offer, targetId: remoteId }
    });
    return;
  }

  if (payload.type === "offer") {
    if (!peer) {
      peer = createPeerConnection(remoteId);
    }
    await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    sendWs({
      type: "signal",
      channelId: currentChannel,
      payload: { type: "answer", sdp: answer, targetId: remoteId }
    });
    return;
  }

  if (payload.type === "answer") {
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    return;
  }

  if (payload.type === "candidate") {
    if (!peer) return;
    await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
  }
}

roomsEl.addEventListener("change", loadChannels);


document.getElementById("register").addEventListener("click", register);
document.getElementById("applyToken").addEventListener("click", applyToken);
document.getElementById("refreshRooms").addEventListener("click", loadRooms);
document.getElementById("createRoom").addEventListener("click", createRoom);
document.getElementById("createChannel").addEventListener("click", createChannel);
document.getElementById("joinChannel").addEventListener("click", joinChannel);
document.getElementById("send").addEventListener("click", () => sendMessage());
document.getElementById("emoji").addEventListener("click", () => sendMessage("😊"));
document.getElementById("upload").addEventListener("click", uploadImage);
document.getElementById("joinVoice").addEventListener("click", joinVoice);
document.getElementById("shareScreen").addEventListener("click", shareScreen);
document.getElementById("stopVoice").addEventListener("click", stopVoice);
