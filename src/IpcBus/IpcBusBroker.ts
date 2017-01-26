/// <reference path='typings/easy-ipc.d.ts'/>

import * as BaseIpc from 'easy-ipc';
import * as IpcBusInterfaces from './IpcBusInterfaces';
import * as IpcBusUtils from './IpcBusUtils';
import {IpcBusData} from './IpcBusClient';
// import * as util from 'util';

import {IpcBusSocketTransport} from './IpcBusNode';
import {IpcBusCommonClient} from './IpcBusClient';

class IpcBusBrokerClient extends IpcBusCommonClient {
     constructor(ipcOptions: IpcBusUtils.IpcOptions) {
        super('Broker_' + process.pid, new IpcBusSocketTransport(ipcOptions));
    }
}

/** @internal */
export class IpcBusBrokerServer implements IpcBusInterfaces.IpcBusBroker {
    private _baseIpc: BaseIpc;
    private _ipcServer: any = null;
    private _ipcOptions: IpcBusUtils.IpcOptions;
    private _subscriptions: IpcBusUtils.ChannelConnectionMap;
    private _requestChannels: Map<string, IpcBusUtils.ChannelConnectionMap.ConnectionData>;
    private _ipcBusBrokerClient: IpcBusBrokerClient;

    private _queryStateLamdba: IpcBusInterfaces.IpcBusListener = (ipcBusEvent: IpcBusInterfaces.IpcBusEvent, replyChannel: string) => this._onQueryState(ipcBusEvent, replyChannel);

    constructor(ipcOptions: IpcBusUtils.IpcOptions) {
        this._ipcOptions = ipcOptions;
        this._baseIpc = new BaseIpc();
        this._subscriptions = new IpcBusUtils.ChannelConnectionMap('[IPCBus:Broker]');
        this._requestChannels = new Map<string, IpcBusUtils.ChannelConnectionMap.ConnectionData>();
        this._baseIpc.on('connection', (socket: any, server: any) => this._onConnection(socket, server));
        this._baseIpc.on('close', (err: any, socket: any, server: any) => this._onClose(err, socket, server));
        this._baseIpc.on('data', (data: any, socket: any, server: any) => this._onData(data, socket, server));

        this._ipcBusBrokerClient = new IpcBusBrokerClient(this._ipcOptions);
    }

    // IpcBusBroker API
    start(timeoutDelay?: number): Promise<string> {
        if (timeoutDelay == null) {
            timeoutDelay = 2000;
        }
        let p = new Promise<string>((resolve, reject) => {
            this._baseIpc.once('listening', (server: any) => {
                // Reentrance guard ?
                if (this._ipcServer) {
                    resolve('started');
                }
                else {
                    this._ipcServer = server;
                    IpcBusUtils.Logger.info(`[IPCBus:Broker] Listening for incoming connections on ${this._ipcOptions}`);
                    this._ipcBusBrokerClient.connect()
                        .then(() => {
                            this._ipcBusBrokerClient.on(IpcBusInterfaces.IpcBusClient.QUERYSTATE_CHANNEL, this._queryStateLamdba);
                            resolve('started');
                        })
                        .catch((err) => reject(`Broker client error = ${err}`));
                }
            });
            setTimeout(() => {
                reject('timeout');
            }, timeoutDelay);
            this._baseIpc.listen(this._ipcOptions.port, this._ipcOptions.host);
        });
        return p;
    }

    stop() {
        if (this._ipcServer) {
            this._ipcBusBrokerClient.off(IpcBusInterfaces.IpcBusClient.QUERYSTATE_CHANNEL, this._queryStateLamdba);
            this._ipcBusBrokerClient.close();
            this._ipcServer.close();
            this._ipcServer = null;
        }
    }

    queryState(): Object {
        let queryStateResult: Object[] = [];
        this._subscriptions.forEach(function (connData, channel) {
            connData.peerNames.forEach(function (count, peerName) {
                queryStateResult.push({ channel: channel, peerName: peerName, count: count });
            });
        });
        return queryStateResult;
    }

    private _onQueryState(ipcBusEvent: IpcBusInterfaces.IpcBusEvent, replyChannel: string) {
        let queryState = this.queryState();
        if (ipcBusEvent.request) {
            ipcBusEvent.request.resolve(queryState);
        }
        else if (replyChannel != null) {
            this._ipcBusBrokerClient.send(replyChannel, queryState);
        }
    }

    private _onConnection(socket: any, server: any): void {
        IpcBusUtils.Logger.info(`[IPCBus:Broker] Incoming connection !`);
        IpcBusUtils.Logger.info('[IPCBus:Broker] socket.address=' + JSON.stringify(socket.address()));
        // IpcBusUtils.Logger.info('[IPCBus:Broker] socket.localAddress=' + socket.localAddress);
        // IpcBusUtils.Logger.info('[IPCBus:Broker] socket.remoteAddress=' + socket.remoteAddress);
        IpcBusUtils.Logger.info('[IPCBus:Broker] socket.remotePort=' + socket.remotePort);
        socket.on('error', (err: string) => {
            IpcBusUtils.Logger.info(`[IPCBus:Broker] Error on connection: ${err}`);
        });
    }

    private _onClose(err: any, socket: any, server: any): void {
        this._subscriptions.releaseConnection(socket.remotePort);
        // ForEach is supposed to support deletion during the iteration !
        this._requestChannels.forEach((connData, channel) => {
            if (connData.connKey === socket.remotePort) {
                this._requestChannels.delete(channel);
            }
        });
        IpcBusUtils.Logger.info(`[IPCBus:Broker] Connection closed !`);
    }

    private _onData(data: any, socket: any, server: any): void {
        if (BaseIpc.Cmd.isCmd(data)) {
            switch (data.name) {
                case IpcBusUtils.IPC_BUS_COMMAND_SUBSCRIBE_CHANNEL: {
//                        const ipcBusData: IpcBusData = data.args[0];
                    const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                    IpcBusUtils.Logger.info(`[IPCBus:Broker] Subscribe to channel '${ipcBusEvent.channel}' from peer #${ipcBusEvent.sender.peerName}`);

                    this._subscriptions.addRef(ipcBusEvent.channel, socket.remotePort, socket, ipcBusEvent.sender.peerName);
                    break;
                }
                case IpcBusUtils.IPC_BUS_COMMAND_UNSUBSCRIBE_CHANNEL: {
                    const ipcBusData: IpcBusData = data.args[0];
                    const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                    IpcBusUtils.Logger.info(`[IPCBus:Broker] Unsubscribe from channel '${ipcBusEvent.channel}' from peer #${ipcBusEvent.sender.peerName}`);

                    if (ipcBusData.unsubscribeAll) {
                        this._subscriptions.releasePeerName(ipcBusEvent.channel, socket.remotePort, ipcBusEvent.sender.peerName);
                    }
                    else {
                        this._subscriptions.release(ipcBusEvent.channel, socket.remotePort, ipcBusEvent.sender.peerName);
                    }
                    break;
                }
                case IpcBusUtils.IPC_BUS_COMMAND_SENDMESSAGE: {
                    const ipcBusData: IpcBusData = data.args[0];
                    const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                    IpcBusUtils.Logger.info(`[IPCBus:Broker] Received send on channel '${ipcBusEvent.channel}' from peer #${ipcBusEvent.sender.peerName}`);

                    this._subscriptions.forEachChannel(ipcBusEvent.channel, function (connData, channel) {
                        // Send data to subscribed connections
                        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_EVENT_SENDMESSAGE, ipcBusData, ipcBusEvent, data.args[2], connData.conn);
                    });
                    break;
                }
                case IpcBusUtils.IPC_BUS_COMMAND_REQUESTMESSAGE: {
                    const ipcBusData: IpcBusData = data.args[0];
                    const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                    IpcBusUtils.Logger.info(`[IPCBus:Broker] Received request on channel '${ipcBusEvent.channel}' (reply = '${ipcBusData.replyChannel}') from peer #${ipcBusEvent.sender.peerName}`);

                    // Register on the replyChannel
                    this._requestChannels.set(ipcBusData.replyChannel, new IpcBusUtils.ChannelConnectionMap.ConnectionData(socket.remotePort, socket));
                    this._subscriptions.forEachChannel(ipcBusEvent.channel, function (connData, channel) {
                        // Request data to subscribed connections
                        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_EVENT_REQUESTMESSAGE, ipcBusData, ipcBusEvent, data.args[2], connData.conn);
                    });
                    break;
                }
                case IpcBusUtils.IPC_BUS_COMMAND_REQUESTRESPONSE: {
                    const ipcBusData: IpcBusData = data.args[0];
                    const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                    IpcBusUtils.Logger.info(`[IPCBus:Broker] Received response request on channel '${ipcBusEvent.channel}' (reply = '${ipcBusData.replyChannel}') from peer #${ipcBusEvent.sender.peerName}`);

                    let connData: IpcBusUtils.ChannelConnectionMap.ConnectionData = this._requestChannels.get(ipcBusData.replyChannel);
                    if (connData) {
                        this._requestChannels.delete(ipcBusData.replyChannel);
                        // Send data to subscribed connections
                        BaseIpc.Cmd.exec(IpcBusUtils.IPC_BUS_EVENT_REQUESTRESPONSE, ipcBusData, ipcBusEvent, data.args[2], connData.conn);
                    }
                    break;
                }
                case IpcBusUtils.IPC_BUS_COMMAND_REQUESTCANCEL: {
                    const ipcBusData: IpcBusData = data.args[0];
                    const ipcBusEvent: IpcBusInterfaces.IpcBusEvent = data.args[1];
                    IpcBusUtils.Logger.info(`[IPCBus:Broker] Received cancel request on channel '${ipcBusEvent.channel}' (reply = '${ipcBusData.replyChannel}') from peer #${ipcBusEvent.sender.peerName}`);

                    this._requestChannels.delete(ipcBusData.replyChannel);
                    break;
                }
            }
        }
    }
}
