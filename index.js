const WebSocket = require('ws');
const Http = require('http');
const Url = require('url');
const handler = require("./handler")
const operatorServer = new WebSocket.Server({noServer: true});
const clientServer = new WebSocket.Server({noServer: true});


const server = Http.createServer()
let clients = [];
let operator = null;


function _onAdddNewClient(socket, request){
  clients.push({
    socket: socket,
    name: request['name'],
    avatar: request['avatar']
  })
  socket.send(JSON.stringify(
      {
        "queue_position":  clients.length,
        "room_name":  null,
        "room_token":  null
      },
    ),
  )
  if(operator != null){
    operator.send(JSON.stringify({
      'type': 'NEW_CLIENT',
      'client': {
        'name': request['name'],
        'avatar': request['avatar']
      }
    }))
  }
}

function _makeRoomName(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}
function _getClients(){
  if(operator == null) return;
  let clientData = []
  for (let i = 0; i < clients.length; i++) {
      clientData.push({
        'name': clients[i]['name'],
        'avatar': clients[i]['avatar']
      })
  }

  operator.send(JSON.stringify({
    type: 'LOAD_CLIENTS',
    clients:  clientData,
  }))
}
function _nextClient(){
  const client = clients.shift();
  const roomName = "room_"+_makeRoomName(7);
  client.socket.send(JSON.stringify({
    "queue_position":  0,
    "room_name":  roomName,
    "room_token":  null
  }));
  operator.send(JSON.stringify({
    "type": "JOIN_ROOM",
    "room": {
      "room_name":  roomName,
      "room_token":  null
    }
  }))
  _notifyClientPosition();
  _getClients()
}

function _notifyClientPosition(){
  clients.forEach((queueClient, index) => {
    queueClient['socket'].send(JSON.stringify({
      "queue_position":  index+1,
      "room_name":  null,
      "room_token":  null
    }))
  });
}


function _onMessageReceive(data, socket, request){
  console.log(data['type'])
  switch (data['type']) {
    case "NEXT_CLIENT":
      _nextClient();
      break;
    case "GET_CLIENTS":
      _getClients();
      break;
    default: 
      break;
  }
}


operatorServer.on('connection', function connection(socket) {
    operator = socket;
    let clientData = []
    for (let i = 0; i < clients.length; i++) {
      clientData.push({
        'name': clients[i]['name'],
        'avatar': clients[i]['avatar']
      })
    }
    socket.send(JSON.stringify({
      type: 'LOAD_CLIENTS',
      clients:  clientData,
    }))
    socket.on('message', (msg) => {
      var event = JSON.parse(msg.toString());
      console.log(event)
      _onMessageReceive(event, socket)
    })
    operatorServer.on('error', console.error);
});

clientServer.on('connection', function connection(socket) {
  socket.on('close', () => {
    clients = clients.filter(c => c.socket !== socket);
    _getClients()
    _notifyClientPosition()
    socket.terminate()
  });
  clientServer.on('error', console.error);
});



server.on('upgrade', function upgrade(request, socket, head) {
  const { pathname, query } = Url.parse(request.url, {parseQueryString: true});
  if (pathname === '/client') {
    clientServer.handleUpgrade(request, socket, head, function done(ws) {
      _onAdddNewClient(ws, query)
      clientServer.emit('connection', ws, request);
    });
  } else if (pathname === '/operator') {
    operatorServer.handleUpgrade(request, socket, head, function done(ws) {
      operatorServer.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});
 
server.listen(8080)