/// <reference types="node" />

import {EventEmitter} from 'events';
import * as IpcBusInterfaces from "./IpcBusInterfaces";
import * as IpcBusUtils from './IpcBusUtils';

// Implementation for Renderer process
export class IpcBusRendererClient extends EventEmitter implements IpcBusInterfaces.IpcBusClient {
    private _ipcObj : any;
    private _connected? : boolean = null;

    constructor(){
        super();
        this._ipcObj = require('electron').ipcRenderer;
        this._ipcObj.on(IpcBusUtils.IPC_BUS_RENDERER_RECEIVE, (eventOrTopic : any, topicOrContent : any, contentOrPeer : any, peerOrUndefined : any) => this._onReceive(eventOrTopic, topicOrContent, contentOrPeer, peerOrUndefined));
    }

    private _onReceive(eventOrTopic : any, topicOrContent : any, contentOrPeer : any, peerOrUndefined : any) : void {
        // In sandbox mode, 1st parameter is no more the event, but the 2nd argument !!!
        if (peerOrUndefined === undefined) {
            console.log("[IPCBus:Client] Received message on '" + eventOrTopic + "'")
            EventEmitter.prototype.emit.call(this, eventOrTopic, eventOrTopic, topicOrContent, contentOrPeer)
        }
        else {
            console.log("[IPCBus:Client] Received message on '" + topicOrContent + "'")
            EventEmitter.prototype.emit.call(this, topicOrContent, topicOrContent, contentOrPeer, peerOrUndefined)
        }
    }
    
    // Set API
    connect(callback : IpcBusInterfaces.IpcBusConnectFunc) : void {
        if (this._connected == false) {
            throw new Error("Connection is closed")
        }
        // connect can be called multiple times
        this._connected = true
        setTimeout(function () {
            callback('connect', -1)
        }, 1)
    }

    close() : void {
        this._connected = false
    }

    send(topic : string, data : Object | string) : void {
        if (this._connected != true) {
            throw new Error("Please connect first")
        }
        this._ipcObj.send(IpcBusUtils.IPC_BUS_RENDERER_SEND, topic, data)
    }

    request(topic : string, data : Object | string, replyCallback : IpcBusInterfaces.IpcBusRequestFunc, timeoutDelay : number) : void {
        if (this._connected != true) {
            throw new Error("Please connect first")
        }

        if (timeoutDelay == null) {
            timeoutDelay = 2000
        }

        const replyTopic = IpcBusUtils.GenerateReplyTopic();
        EventEmitter.prototype.once.call(this, replyTopic, function (replyTopic : string, data : Object | string, peer : string) {
            replyCallback(topic, data, peer)
        })
        this._ipcObj.send(IpcBusUtils.IPC_BUS_RENDERER_REQUEST, topic, data, replyTopic, timeoutDelay)
    }

    queryBrokerState(topic : string) : void {
        if (this._connected != true) {
            throw new Error("Please connect first")
        }
        this._ipcObj.send(IpcBusUtils.IPC_BUS_RENDERER_QUERYSTATE, topic)
    }

    subscribe(topic : string, handler : IpcBusInterfaces.IpcBusListenFunc) : void {
        if (this._connected != true) {
            throw new Error("Please connect first")
        }
        EventEmitter.prototype.addListener.call(this, topic, handler)
        this._ipcObj.send(IpcBusUtils.IPC_BUS_RENDERER_SUBSCRIBE, topic)
    }

    unsubscribe(topic : string,  handler : IpcBusInterfaces.IpcBusListenFunc) : void {
        if (this._connected != true) {
            throw new Error("Please connect first")
        }
        EventEmitter.prototype.removeListener.call(this, topic, handler)
        this._ipcObj.send(IpcBusUtils.IPC_BUS_RENDERER_UNSUBSCRIBE, topic)
    }
}
