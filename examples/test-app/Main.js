//////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Electron Test App

'use strict';

// Node
const util = require('util');
const path = require('path');
const child_process = require('child_process');

// Electron 
const electronApp = require('electron').app;
const electronSession = require('electron').session;
const ipcMain = require('electron').ipcMain;
const BrowserWindow = require('electron').BrowserWindow;

// Debug rules
electronApp.commandLine.appendSwitch('remote-debugging-port', '55555');
electronApp.commandLine.appendSwitch('host-rules', 'MAP * 127.0.0.1');

// Misc
const uuid = require('uuid');
const busPath = 55556; // '/tr-ipc-bus/' + uuid.v4();
console.log('IPC Bus Path : ' + busPath);

// IPC Bus
const ipcBusModule = require('electron-ipc-bus');
// const ipcBus = ipcBusModule.CreateIpcBusForClient('browser', busPath);
const ipcBus = ipcBusModule.CreateIpcBus(busPath);

// Load node-import without wrapping to variable. 
require('node-import');
imports('ProcessConnector');

// Helpers
function spawnNodeInstance(scriptPath) {
    const args = [path.join(__dirname, scriptPath), '--parent-pid=' + process.pid, '--bus-path=' + busPath];

    let options = { env: {} };
    for (let key of Object.keys(process.env)) {
        options.env[key] = process.env[key];
    }

    options.env['ELECTRON_RUN_AS_NODE'] = '1';
    options.stdio = ['pipe', 'pipe', 'pipe', 'ipc'];
    return child_process.spawn(process.argv[0], args, options);
}

// Window const
var preloadFile = path.join(__dirname, 'BundledBrowserWindowPreload.js');
var width = 1000;

var MainProcess = (function () {

    function MainProcess() {
        var self = this;
        var processId = 0;
        var instances = new Map;

        // Listen view messages
        var processMainFromView = new ProcessConnector('browser', ipcMain);
        // processMainFromView.onRequestMessage(onIPCElectron_RequestMessage);
        processMainFromView.onRequestPromiseMessage(onIPCElectron_RequestPromiseMessage);
        processMainFromView.onSendMessage(onIPCElectron_SendMessage);
        processMainFromView.onSubscribe(onIPCElectron_Subscribe);
        processMainFromView.onUnsubscribe(onIPCElectron_Unsubscribe);
        processMainFromView.on('new-process', doNewProcess);
        processMainFromView.on('new-renderer', doNewRenderer);

        const mainWindow = new BrowserWindow({
            width: width, height: 800,
            webPreferences:
            {
                preload: preloadFile
            }
        });
        mainWindow.on('close', function () {
            instances.forEach(function (value, key, map) {
                value.term();
            });
            instances.clear();
        });

        mainWindow.loadURL('file://' + path.join(__dirname, 'CommonView.html'));

        var processMainToView = new ProcessConnector('browser', mainWindow.webContents);
        mainWindow.webContents.on('dom-ready', function () {
            mainWindow.webContents.send('initializeWindow', { title: 'Main', type: 'browser', peerName: 'Main', webContentsId: mainWindow.webContents.id });
        });

        function getSession(sessionId) {
            var sessionName = 'persist:process' + sessionId;
            var session = electronSession.fromPartition(sessionName);
            return session;
        }

        function doNewProcess(processType) {
            var newProcess = null;
            switch (processType) {
                case 'renderer':
                    newProcess = new RendererProcess(processId, getSession(processId));
                    break;
                case 'node':
                    newProcess = new NodeProcess(processId);
                    break;
            }
            if (newProcess != null) {
                instances.set(processId, newProcess);
                newProcess.onClose(function (processId) {
                    instances.delete(processId);
                });
                ++processId;
            }
        }

        function doNewRenderer(sessionId) {
            var newProcess = new RendererProcess(processId, getSession(sessionId));
            if (newProcess != null) {
                instances.set(processId, newProcess);
                newProcess.onClose(function (processId) {
                    instances.delete(processId);
                });
            }
            ++processId;
        }

        function onIPCElectron_ReceivedMessage(topicName, topicMsg, peerName, topicToReply) {
            console.log('Master - onIPCElectron_ReceivedMessage - topic:' + topicName + ' data:' + topicMsg);
            processMainToView.postReceivedMessage(topicName, topicMsg, peerName, topicToReply);
        }

        function onIPCElectron_Subscribe(topicName) {
            console.log('Master - onIPCElectron_Subscribe:' + topicName);
            ipcBus.subscribe(topicName, onIPCElectron_ReceivedMessage);
            processMainToView.postSubscribeDone(topicName);
        }

        function onIPCElectron_Unsubscribe(topicName) {
            console.log('Master - onIPCElectron_Subscribe:' + topicName);
            ipcBus.unsubscribe(topicName, onIPCElectron_ReceivedMessage);
            processMainToView.postUnsubscribeDone(topicName);
        }

        function onIPCElectron_SendMessage(topicName, topicMsg) {
            console.log('Master - onIPCElectron_SendMessage : topic:' + topicName + ' msg:' + topicMsg);
            ipcBus.send(topicName, topicMsg);
        }

        // function onIPCElectron_RequestMessage(topicName, topicMsg) {
        //     console.log('Master - onIPCElectron_RequestMessage : topic:' + topicName + ' msg:' + topicMsg);
        //     ipcBus.request(topicName, topicMsg, function (topic, content, peerName) {
        //         processMainToView.postRequestResult(topic, topicMsg, content, peerName);
        //     });
        // }

        function onIPCElectron_RequestPromiseMessage(topicName, topicMsg) {
            console.log('Master - onIPCElectron_RequestPromiseMessage : topic:' + topicName + ' msg:' + topicMsg);
            ipcBus.request(topicName, topicMsg)
                .then((requestPromiseResponse) => {
                    processMainToView.postRequestPromiseThen(requestPromiseResponse);
                })
                .catch((err) => {
                    processMainToView.postRequestPromiseCatch(err);
                });
        }

    }
    return MainProcess;
})();

var RendererProcess = (function () {

    function RendererProcess(processId, session) {
        var rendererWindows = new Map();
        var callbackClose;
        var self = this;
        createWindow();

        function createWindow() {
            const rendererWindow = new BrowserWindow({
                width: width, height: 600,
                webPreferences:
                {
                    session: session,
                    preload: preloadFile
                }
            });
            rendererWindow.loadURL('file://' + path.join(__dirname, 'CommonView.html'));
            rendererWindow.webContents.on('dom-ready', function () {
                rendererWindow.webContents.send('initializeWindow', { title: 'Renderer', type: 'renderer', id: processId, peerName: 'Renderer_' + rendererWindow.webContents.id, webContentsId: rendererWindow.webContents.id });
            });

            rendererWindows.set(rendererWindow.webContents.id, rendererWindow);
            rendererWindow.on('close', function () {
                self.rendererWindows.delete(rendererWindow.webContents.id);
                if (self.rendererWindows.size === 0) {
                    self.callbackClose();
                }
            });
        };

        this.onClose = function _onClose(callback) {
            callbackClose = callback;
        };

        this.term = function _term() {
            while (rendererWindows.length > 0) {
                rendererWindows[0].close();
            }
        };
    };
    return RendererProcess;
})();

// Classes
var NodeProcess = (function () {

    function NodeInstance() {
        this.process = spawnNodeInstance('NodeInstance.js');
        this.process.stdout.addListener('data', data => { console.log('<NODE> ' + data.toString()); });
        this.process.stderr.addListener('data', data => { console.log('<NODE> ' + data.toString()); });
        console.log('<MAIN> Node instance #' + this.process.pid + ' started !');
    }

    function NodeProcess(processId) {
        var self = this;

        var nodeWindow = null;
        var processMainToView = null;

        var nodeInstance = null;

        // Listen view messages
        var processMainFromView = new ProcessConnector('node', ipcMain, processId);
        // processMainFromView.onRequestMessage(onIPCElectron_RequestMessage);
        processMainFromView.onRequestPromiseMessage(onIPCElectron_RequestPromiseMessage);
        processMainFromView.onSendMessage(onIPCElectron_SendMessage);
        processMainFromView.onSubscribe(onIPCElectron_Subscribe);
        processMainFromView.onUnsubscribe(onIPCElectron_Unsubscribe);

        // Create node process
        nodeInstance = new NodeInstance();
        nodeInstance.process.on('message', onIPCProcess_Message);
        nodeInstance.process.send(JSON.stringify({ action: 'init', args: { title: 'Node', type: 'node', id: processId } }));
        nodeInstance.process.on('exit', function() {
            if (nodeWindow) {
                nodeWindow.close();
                nodeWindow = null;
            }
        });

        // Create node window
        nodeWindow = new BrowserWindow({
            width: width, height: 600,
            webPreferences:
            {
                preload: preloadFile
            }
        });
        processMainToView = new ProcessConnector('node', nodeWindow.webContents, processId);
        nodeWindow.loadURL('file://' + path.join(__dirname, 'CommonView.html'));
        nodeWindow.webContents.on('dom-ready', function () {
            nodeWindow.webContents.send('initializeWindow', { title: 'Node', type: 'node', id: processId, peerName: 'Node_' + nodeInstance.process.pid, webContentsId: nodeWindow.webContents.id });
        });

        nodeWindow.on('close', function () {
            nodeWindow = null;
            self.term();
        });

        this.term = function _term() {
            if (nodeInstance) {
                nodeInstance.process.kill();
                nodeInstance = null;
            }
        };

        this.onClose = function _onClose(callback) {
            nodeInstance.process.on('exit', function () {
                callback(processId);
            });
        };

        function onIPCProcess_Message(data) {
            var msgJSON = JSON.parse(data);
            if (msgJSON.hasOwnProperty('action')) {
                switch (msgJSON['action']) {
                    case 'receivedRequestPromiseThen':
                        processMainToView.postRequestPromiseThen(msgJSON['args']['requestPromiseResponse']);
                        break;
                    case 'receivedRequestPromiseCatch':
                        processMainToView.postRequestPromiseCatch(msgJSON['args']['err']);
                        break;
                    case 'receivedRequest':
                        processMainToView.postRequestResult(msgJSON['args']['topic'], msgJSON['args']['msg'], msgJSON['args']['response'], msgJSON['args']['peerName']);
                        break;
                    case 'receivedSend':
                        processMainToView.postReceivedMessage(msgJSON['args']['topic'], msgJSON['args']['msg'], msgJSON['args']['peerName'], msgJSON['args']['topicToReply']);
                        break;
                    case 'subscribe':
                        processMainToView.postSubscribeDone(msgJSON['topic']);
                        break;
                    case 'unsubscribe':
                        processMainToView.postUnsubscribeDone(msgJSON['topic']);
                        break;
                }
            }
        };

        function onIPCElectron_Subscribe(topicName) {
            console.log('Node - onIPCElectron_Subscribe:' + topicName);
            var msgJSON = {
                    action: 'subscribe',
                    topic: topicName
                };
            nodeInstance.process.send(JSON.stringify(msgJSON));
        };

        function onIPCElectron_Unsubscribe(topicName) {
            console.log('Node - onIPCElectron_Subscribe:' + topicName);
            var msgJSON = {
                    action: 'unsubscribe',
                    topic: topicName
                };
            nodeInstance.process.send(JSON.stringify(msgJSON));
            processMainToView.postUnsubscribeDone(topicName);
        };

        // function onIPCElectron_RequestMessage(topicName, topicMsg) {
        //     console.log('Node - onIPCElectron_RequestMessage : topic:' + topicName + ' msg:' + topicMsg);
        //     var msgJSON = {
        //             action: 'request',
        //             args: { topic: topicName, msg: topicMsg }
        //         };
        //     nodeInstance.process.send(JSON.stringify(msgJSON));
        // };

        function onIPCElectron_RequestPromiseMessage(topicName, topicMsg) {
            console.log('Node - onIPCElectron_RequestMessage : topic:' + topicName + ' msg:' + topicMsg);
            var msgJSON = {
                    action: 'requestPromise',
                    args: { topic: topicName, msg: topicMsg }
                };
            nodeInstance.process.send(JSON.stringify(msgJSON));
        };

        function onIPCElectron_SendMessage(topicName, topicMsg) {
            console.log('Node - onIPCElectron_SendMessage : topic:' + topicName + ' msg:' + topicMsg);
            var msgJSON = {
                    action: 'send',
                    args: { topic: topicName, msg: topicMsg }
                };
            nodeInstance.process.send(JSON.stringify(msgJSON));
        };
    }

    return NodeProcess;

})();
// Startup
let ipcBrokerInstance = null;

electronApp.on('ready', function () {

    // Setup IPC Broker
    console.log('<MAIN> Starting IPC broker ...');
    ipcBrokerInstance = spawnNodeInstance('BrokerNodeInstance.js');
    ipcBrokerInstance.on('message', function (msg) {

        console.log('<MAIN> IPC broker is ready !');
        // Setup IPC Client (and renderer bridge)
        ipcBus.connect(function () {
            new MainProcess();
        });
    });
    ipcBrokerInstance.stdout.addListener('data', data => { console.log('<BROKER> ' + data.toString()); });
    ipcBrokerInstance.stderr.addListener('data', data => { console.log('<BROKER> ' + data.toString()); });
});

