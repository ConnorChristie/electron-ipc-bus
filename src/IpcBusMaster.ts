/// <reference types="node" />
/// <reference path="typings/easy-ipc.d.ts"/>

import {EventEmitter} from 'events';
import {Ipc as BaseIpc} from 'easy-ipc';
//import BaseIpc from 'easy-ipc';
import {IpcBusNodeClient} from "./IpcBusNode";
import * as IpcBusUtils from './IpcBusUtils';

class IpcBusBridge {
    _ipcObj : any;
    _topicRendererRefs : IpcBusUtils.TopicConnectionMap;
    _webContents : any;
    _busConn : any;
    _eventEmitter : EventEmitter;
    _lambdaListenerHandler : Function;

    constructor(eventEmitter : EventEmitter, conn : any){
        this._eventEmitter = eventEmitter;
        this._busConn = conn;
        this._ipcObj = require("electron").ipcMain;
        this._topicRendererRefs = new IpcBusUtils.TopicConnectionMap();
        this._webContents = require("electron").webContents;
        this._lambdaListenerHandler = (msgTopic : string, msgContent : any, msgPeer : string) => this.rendererSubscribeHandler(msgTopic, msgContent, msgPeer);

        this._ipcObj.addListener(IpcBusUtils.IPC_BUS_RENDERER_SUBSCRIBE, (event : any, topic : string) => this.onSubscribe(event, topic));
        this._ipcObj.addListener(IpcBusUtils.IPC_BUS_RENDERER_UNSUBSCRIBE, (event : any, topic : string) => this.onUnsubscribe(event, topic));
        this._ipcObj.addListener(IpcBusUtils.IPC_BUS_RENDERER_SEND, (event :any, topic : string, data : any) => this.onSend(event, topic, data));
        this._ipcObj.addListener(IpcBusUtils.IPC_BUS_RENDERER_REQUEST, (event : any, topic : string, data : any, replyTopic : string, timeoutDelay : number) => this.onRequest(event, topic, data, replyTopic, timeoutDelay));
        this._ipcObj.addListener(IpcBusUtils.IPC_BUS_RENDERER_QUERYSTATE, (event : any, topic : string) => this.onQueryState(event, topic));
        console.log("[IPCBus:Bridge] Installed");
    }

    rendererSubscribeHandler(msgTopic : string, msgContent : any, msgPeer : string) : void {
        console.log("[IPCBus:Bridge] message received on '" + msgTopic + "'");
        let self = this;
        this._topicRendererRefs.forEachTopic(msgTopic, function (peerNames : Map<string, number>, valueId : any, topic : string) {
            const peerName = "Renderer_" + valueId;
            console.log("[IPCBus:Bridge] Forward message received on '" + topic + "' to peer #" + peerName);
            var webContentsId = self._webContents.fromId(valueId);
            if (webContentsId != undefined) {
                webContentsId.send(IpcBusUtils.IPC_BUS_RENDERER_RECEIVE, topic, msgContent, msgPeer);
            }
        })
    }

    rendererCleanUp(webContentsId : string) : void {
        this._topicRendererRefs.releaseConnection(webContentsId, (keyTopic : string, valueId : any, peerName : string, count : number) => this.onUnsubscribeCB(keyTopic, valueId, peerName, count));
    }

    onSubscribe(event : any, topic : string) : void {
        const webContentsId = event.sender;
        const peerName = "Renderer_" + webContentsId.id
        console.log("[IPCBus:Bridge] Peer #" + peerName + " subscribed to topic '" + topic + "'")
        let self = this; // closure
        this._topicRendererRefs.addRef(topic, webContentsId.id, peerName, function (keyTopic : string, valueId : any, peerName : string, count : number) {
        // If it is the first time this renderer is listening this topic, we have to add the callback
            if (count == 1) {
                EventEmitter.prototype.addListener.call(self._eventEmitter, topic, self._lambdaListenerHandler)
                console.log("[IPCBus:Bridge] Forward subscribe '" + topic + "' to IPC Broker")
                webContentsId.on("destroyed", function () {
                    self.rendererCleanUp(valueId);
                });
            }
            BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_COMMAND_SUBSCRIBETOPIC, topic, peerName, self._busConn)
        })
    }

    onUnsubscribeCB(topic : string, valueId : any, peerName : string, count : number)
    {
        // If it is the last time this renderer is listening this topic, we have to remove the callback
        if (count == 0) {
            console.log("[IPCBus:Bridge] Forward unsubscribe '" + topic + "' to IPC Broker");
            EventEmitter.prototype.removeListener.call(this._eventEmitter, topic, this._lambdaListenerHandler);
        }
        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_COMMAND_UNSUBSCRIBETOPIC, topic, peerName, this._busConn);        
    }

    onUnsubscribe(event : any, topic : string) {
        const webContentsId = event.sender;
        const peerName = "Renderer_" + webContentsId.id;
        console.log("[IPCBus:Bridge] Peer #" + peerName + " unsubscribed from topic : '" + topic + "'");
        let self = this;
        this._topicRendererRefs.release(topic, webContentsId.id, peerName, (keyTopic : string, valueId : any, peerName : string, count : number) => this.onUnsubscribeCB(keyTopic, valueId, peerName, count));
    }

    onSend(event :any, topic : string, data : any) : void {
        const webContentsId = event.sender;
        const peerName = "Renderer_" + webContentsId.id;
        console.log("[IPCBus:Bridge] Peer #" + peerName + " sent message on '" + topic + "'");
        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_COMMAND_SENDMESSAGE, topic, data, peerName, this._busConn);
    }

    onRequest(event : any, topic : string, data : any, replyTopic : string, timeoutDelay : number) : void {
        const webContentsId = event.sender;
        const peerName = "Renderer_" + webContentsId.id;
        console.log("[IPCBus:Bridge] Peer #" + peerName + " sent request on '" + topic + "'");
        if (timeoutDelay == null) {

            timeoutDelay = 2000; // 2s by default
        }

        // Prepare reply's handler
        let self = this;
        const replyHandler = function (replyTopic : string, content : any, peerName : string) {
            console.log('Peer #' + peerName + ' replied to request on ' + replyTopic + ' : ' + content);
            EventEmitter.prototype.removeListener.call(self._eventEmitter, replyTopic, replyHandler);
            BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_COMMAND_UNSUBSCRIBETOPIC, replyTopic, peerName, self._busConn);
            webContentsId.send(IpcBusUtils.IPC_BUS_RENDERER_RECEIVE, replyTopic, content, peerName);
        }
        EventEmitter.prototype.addListener.call(this._eventEmitter, replyTopic, replyHandler);

        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_COMMAND_SUBSCRIBETOPIC, replyTopic, peerName, this._busConn);
        // Execute request
        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_COMMAND_REQUESTMESSAGE, topic, data, replyTopic, peerName, this._busConn);
    }

    onQueryState(event : any, topic : string) {
        const webContentsId = event.sender;
        const peerName = "Renderer_" + webContentsId.id;
        console.log("[IPCBus:Bridge] Peer #" + peerName + " query Broker state on topic : '" + topic + "'");
        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_COMMAND_QUERYSTATE, topic, peerName, this._busConn);
    }
}


// Implementation for Master process
export class IpcBusMasterClient extends IpcBusNodeClient {
    private _ipcBusBridge : IpcBusBridge;

    constructor(busPath? : string) {
        super(busPath);
        this._peerName = "Master";
    }

    // Set API
    connect(callback : Function) {
        let self = this; // closure
        super.connect(function(event : string, conn : any){
            self._ipcBusBridge = new IpcBusBridge(self, conn);
            callback(event, conn);
        })
    }
}

