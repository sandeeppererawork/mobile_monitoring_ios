const express = require('express');
const ab2str = require('arraybuffer-to-string')
var app = express();
var ip = require("ip");
const PORT = 8000;
app.use(express.static('./dist'))
var server = require('http').createServer(app);
var io = require('socket.io')(server);
const connectedDevices = {}

// Keys to be used in Socket-Client.
const KEY_CONNECTED_TO_CLIENT = "connectedToClient";
const KEY_CONNECTED_TO_DEVICE = "connectedToDevice";
const KEY_DEVICE_ID = "deviceId";
const KEY_DEVICE_DATA = "deviceData";


// Socket Messages :
// This event will be emitted to Device when Client (Web) is disconnected from device.
const CLIENT_DISCONNECTED = "disconnectedFromClient"; 
// This event will be emitted to Device whenever Client (Web) is connected.
const CLIENT_CONNECTED = "connectedToClient"; 
// Event from client when any device is selected.
const CLIENT_CONNECT_TO_DEVICE = "connectToDevice";
// Event from client when it is disconnected to Device.
const CLIENT_DISCONNECT_TO_DEVICE = "disconnectFromDevice";
// This event will be emitted to Client when device is disconnected.
const DEVICE_DISCONNECTED = "deviceDisconnected";
// This event will be emitted to Client whenever any new device is connected.
const NEW_DEVICE_CONNECTED = "newDeviceConnected";
// This event will be emitted to Client whenever any connected device is freed by client.
const DEVICE_UNBLOCKED = "deviceUnBlocked";
// This event will be emitted to Client whenever any connected device is blocked by client.
const DEVICE_BLOCKED = "deviceBlocked";
// Event from Client to get the connected Device list.
const GET_CONNECTED_DEVICES = "getConnectedDevices";
// Event to share ScreenShot data from Device to Client.
const SCREEN_SHOT_DATA = "screenShot"
// Event to share RawScreenShot data from Device to Client.
const RAW_SCREEN_SHOT_DATA = "rawScreenShot"
// Event to share DeviceOrientaionChange data from Device to Client.
const DEVICE_ORIENTAION_CHANGE_DATA = "deviceOrientationChanged"
// Event from Device to Register in Server.
const REGISTER_DEVICE = "registerDevice"
// Event to Perform Action from Client to Device.
const PERFORM_ACTION = "performAction";

// Socket Client Default Commands
const ON_SOCKET_CLEINT_CONNECT = "connection"
const ON_SOCKET_CLEINT_DISCONNECTED = "disconnect";

function getDeviceData(deviceClient) {
    return {
        "isBlocked" : deviceClient[KEY_CONNECTED_TO_CLIENT] ? true : false,
        "deviceMeta" : deviceClient[KEY_DEVICE_DATA]
    }
}

function onDeviceUnblocked(deviceClient) {
    deviceClient[KEY_CONNECTED_TO_CLIENT] = null;
    deviceClient.emit(CLIENT_DISCONNECTED);
    io.local.emit(DEVICE_UNBLOCKED,getDeviceData(deviceClient));
}

io.on(ON_SOCKET_CLEINT_CONNECT, function(client) {
    console.log("client connected");
    client.on(PERFORM_ACTION, function(data, callback) {
        const deviceClient = client[KEY_CONNECTED_TO_DEVICE];
        if(deviceClient) {
            deviceClient.emit(PERFORM_ACTION,data,function(data) {
                if(callback) {
                    var decodedString = ab2str(data, 'utf8');
                    callback(decodedString);
                }
            })
        }
    });

    client.on(GET_CONNECTED_DEVICES,function(data, callback) {
        if(callback) {
            const connectedDeviceArray = [];
            for(key in connectedDevices) {
                const deviceClient = connectedDevices[key];
                connectedDeviceArray.push(getDeviceData(deviceClient));
            }
            callback(connectedDeviceArray);
        }
    });

    client.on(REGISTER_DEVICE, function(data) {
        const deviceId = data.deviceId;
        client[KEY_DEVICE_ID] = deviceId;
        client[KEY_DEVICE_DATA] = data;
        connectedDevices[deviceId] = client;
        client.broadcast.emit(NEW_DEVICE_CONNECTED,getDeviceData(client));
    })

    client.on(CLIENT_CONNECT_TO_DEVICE,function(deviceId, callback) {
        const deviceClient = connectedDevices[deviceId];
        if(deviceClient) {
            client[KEY_CONNECTED_TO_DEVICE] = deviceClient;
            deviceClient[KEY_CONNECTED_TO_CLIENT] = client;
            deviceClient.emit(CLIENT_CONNECTED,function(){
                callback(deviceClient[KEY_DEVICE_DATA]); // Device connected Successfully.
                client.broadcast.emit(DEVICE_BLOCKED,getDeviceData(deviceClient));
            });
        }
    });

    client.on(CLIENT_DISCONNECT_TO_DEVICE, function() {
        const deviceClient = client[KEY_CONNECTED_TO_DEVICE];
        if(deviceClient) {
            client[KEY_CONNECTED_TO_DEVICE] = null;
            onDeviceUnblocked(deviceClient);
        }
    })

    client.on(SCREEN_SHOT_DATA, function(data) {
        const connectedClient = client[KEY_CONNECTED_TO_CLIENT];
        if(connectedClient && data) {
            var decodedString = ab2str(data, 'utf8');
            connectedClient.emit(SCREEN_SHOT_DATA,decodedString);
        }
    });

    client.on(RAW_SCREEN_SHOT_DATA, function(data) {
        const connectedClient = client[KEY_CONNECTED_TO_CLIENT];
        if(connectedClient && data) {
            connectedClient.emit(RAW_SCREEN_SHOT_DATA,data);
        }
    });

    client.on(DEVICE_ORIENTAION_CHANGE_DATA, function(data) {
        const connectedClient = client[KEY_CONNECTED_TO_CLIENT];
        if(connectedClient && data) {
            connectedClient.emit(DEVICE_ORIENTAION_CHANGE_DATA,data);
        }
    });

    client.on(ON_SOCKET_CLEINT_DISCONNECTED, function(){
        const deviceId = client[KEY_DEVICE_ID];
        // Device disconnected.
        if(deviceId) {
            const connectedClient = client[KEY_CONNECTED_TO_CLIENT];
            if(connectedClient) {
                connectedClient[KEY_CONNECTED_TO_DEVICE] = null; // Remove connected device.
            }
            client.broadcast.emit(DEVICE_DISCONNECTED,getDeviceData(client));
            delete connectedDevices[deviceId];
        }
        else {
            // Client(Web) disconnected.
            const deviceClient = client[KEY_CONNECTED_TO_DEVICE];
            if(deviceClient) {
                onDeviceUnblocked(deviceClient);
            }
        }
        console.log("client disconnected")
    });
 });



server.listen(PORT);

console.log("Server started : http://"+ip.address()+":"+PORT);

// Socket Example : https://github.com/socketio/socket.io/blob/master/examples/chat/index.js