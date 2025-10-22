const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = 3000;
const wss = new WebSocket.Server({ port: PORT }, () =>
  console.log(`🚀 WebSocket server running on ws://localhost:${PORT}`)
);

const clients = new Map();
const userColors = new Map();
const typingUsers = new Map();

const colors = [
  '#FF6B6B', '#4ECDC4', '#FFD166', '#06D6A0',
  '#118AB2', '#9B5DE5', '#F15BB5', '#00BBF9'
];

const userNames = [
  'lila', 'omar', 'sara', 'khaled', 'noor', 'maha', 'ziad', 'rana',
  'tarek'
];

function getColorForUser(userId) {
  if (!userColors.has(userId)) {
    userColors.set(userId, colors[userColors.size % colors.length]);
  }
  return userColors.get(userId);
}

function getRandomName() {
  return userNames[Math.floor(Math.random() * userNames.length)];
}

function broadcast(data, excludeSocket = null) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client !== excludeSocket) {
      client.send(message);
    }
  });
}

function cleanupTyping(userId) {
  if (typingUsers.has(userId)) {
    clearTimeout(typingUsers.get(userId).timeout);
    typingUsers.delete(userId);
  }
}

wss.on('connection', (socket) => {
  const userId = uuidv4();
  const userName = getRandomName();
  const userColor = getColorForUser(userId);
  
  clients.set(socket, { userId, userName, userColor });
  
  socket.send(JSON.stringify({
    type: 'welcome',
    userId,
    userName,
    userColor,
    onlineCount: wss.clients.size
  }));
  
  broadcast({
    type: 'user_joined',
    userId,
    userName,
    userColor,
    onlineCount: wss.clients.size,
    timestamp: Date.now()
  });
  
  console.log(` ${userName} joined the chat`);

  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const userData = clients.get(socket);
      
      if (!userData) return;
      
      switch (message.type) {
        case 'message':
          const messageId = uuidv4();
          const messageData = {
            type: 'message',
            id: messageId,
            userId: userData.userId,
            userName: userData.userName,
            userColor: userData.userColor,
            text: message.text,
            timestamp: Date.now()
          };
          
          broadcast(messageData);
          console.log(` ${userData.userName}: ${message.text}`);
          break;
          
        case 'typing_start':
          cleanupTyping(userData.userId);
          
          const timeoutId = setTimeout(() => {
            typingUsers.delete(userData.userId);
            broadcast({
              type: 'typing_stop',
              userId: userData.userId
            });
          }, 2000);
          
          typingUsers.set(userData.userId, {
            userName: userData.userName,
            timeout: timeoutId
          });
          
          broadcast({
            type: 'typing_start',
            userId: userData.userId,
            userName: userData.userName
          });
          break;
          
        case 'typing_stop':
          cleanupTyping(userData.userId);
          broadcast({
            type: 'typing_stop',
            userId: userData.userId
          });
          break;
          
        case 'user_update':
          if (message.userName && message.userName !== userData.userName) {
            const oldName = userData.userName;
            userData.userName = message.userName;
            
            broadcast({
              type: 'user_updated',
              userId: userData.userId,
              oldName,
              newName: message.userName,
              timestamp: Date.now()
            });
            
            console.log(` ${oldName} changed name to ${message.userName}`);
          }
          break;
      }
    } catch (error) {
      console.error(' Error processing message:', error);
    }
  });

  socket.on('close', () => {
    const userData = clients.get(socket);
    if (userData) {
      cleanupTyping(userData.userId);
      clients.delete(socket);
      
      broadcast({
        type: 'user_left',
        userId: userData.userId,
        userName: userData.userName,
        onlineCount: wss.clients.size,
        timestamp: Date.now()
      });
      
      console.log(`🔌 ${userData.userName} left the chat`);
    }
  });

  socket.on('error', (error) => {
    console.error(' Connection error:', error);
  });
});

console.log(` Server ready! Connected clients: ${wss.clients.size}`);