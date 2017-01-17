// Constants
export const IPC_BUS_RENDERER_HANDSHAKE = 'IPC_BUS_RENDERER_HANDSHAKE';
export const IPC_BUS_RENDERER_CONNECT = 'IPC_BUS_RENDERER_CONNECT';
export const IPC_BUS_RENDERER_CLOSE = 'IPC_BUS_RENDERER_CLOSE';
export const IPC_BUS_RENDERER_SUBSCRIBE = 'IPC_BUS_RENDERER_SUBSCRIBE';
export const IPC_BUS_RENDERER_UNSUBSCRIBE = 'IPC_BUS_RENDERER_UNSUBSCRIBE';
export const IPC_BUS_RENDERER_SEND = 'IPC_BUS_RENDERER_SEND';
export const IPC_BUS_RENDERER_REQUEST = 'IPC_BUS_RENDERER_REQUEST';
export const IPC_BUS_RENDERER_EMIT_SEND = 'IPC_BUS_RENDERER_EMIT_SEND';
export const IPC_BUS_RENDERER_EMIT_REQUEST = 'IPC_BUS_RENDERER_EMIT_REQUEST';
export const IPC_BUS_RENDERER_QUERYSTATE = 'IPC_BUS_RENDERER_QUERYSTATE';

export const IPC_BUS_COMMAND_SUBSCRIBE_CHANNEL = 'subscribeChannel';
export const IPC_BUS_COMMAND_UNSUBSCRIBE_CHANNEL = 'unsubscribeChannel';
export const IPC_BUS_COMMAND_SENDMESSAGE = 'sendMessage';
export const IPC_BUS_COMMAND_REQUESTMESSAGE = 'requestMessage';
export const IPC_BUS_COMMAND_QUERYSTATE = 'queryState';

export const IPC_BUS_EVENT_SENDMESSAGE = 'onSendMessage';
export const IPC_BUS_EVENT_REQUESTMESSAGE = 'onRequestMessage';

function uuid(): string {
    return Math.random().toString(36).substring(2, 14) + Math.random().toString(36).substring(2, 14);
}

/** @internal */
export function GenerateReplyChannel(): string {
    return 'replyChannel/' + uuid();
}

/** @internal */
function GetCmdLineArgValue(argName: string): string {
    for (let i = 0; i < process.argv.length; ++i) {
        if (process.argv[i].startsWith('--' + argName)) {
            const argValue = process.argv[i].split('=')[1];
            return argValue;
        }
    }
    return null;
}

/** @internal */
export class IpcOptions {
    port: any;      // with easy ipc, port can be either a number or a string (Function support is hidden).
    host: string;

    isValid(): boolean {
        return (this.port != null);
    }
};

// This method may be called from a pure JS stack.
// It means we can not trust type and we have to check it.
export function ExtractIpcOptions(busPath: string): IpcOptions {
    let ipcOptions: IpcOptions = new IpcOptions();
    if (busPath == null) {
        busPath = GetCmdLineArgValue('bus-path');
    }
    if (busPath != null) {
        if (typeof busPath === 'number') {
            ipcOptions.port = busPath;
        }
        else if (typeof busPath === 'string') {
            let parts = busPath.split(':');
            if (parts.length === 1) {
                ipcOptions.port = parts[0];
            }
            else if (parts.length === 2) {
                ipcOptions.host = parts[0];
                ipcOptions.port = parts[1];
            }
        }
    }
    return ipcOptions;
}

/** @internal */
export class Logger {
    private static _enable: boolean = false;
    private static _init: boolean = Logger._initialize();

    private static _initialize(): boolean {
        Logger.enable(Logger._enable);
        Logger._init = true;    // to prevent ts error on not used parameter
        return true;
    }

    private static _info(msg: string) {
        console.log(msg);
    }

    private static _warn(msg: string) {
        console.warn(msg);
    }

    private static _error(msg: string) {
        console.error(msg);
    }

    static info(msg: string) {}
    static warn (msg: string) {};
    static error(msg: string) {};

    static enable(enable: boolean) {
        Logger._enable = enable;
        if (enable) {
            Logger.info = Logger._info;
            Logger.warn = Logger._warn ;
            Logger.error = Logger._error;
        }
        else {
            Logger.info = function() {};
            Logger.warn = function() {};
            Logger.error = function() {};
        }
    }
};

/** @internal */
export class ChannelConnectionMap {
    private _name: string;
    private _channelsMap: Map<string, Map<string, ChannelConnectionMap.ConnectionData>>;

    constructor(name: string) {
        this._name = name;
        this._channelsMap = new Map<string, Map<string, ChannelConnectionMap.ConnectionData>>();
    }

    private _info(str: string) {
        Logger.info(`[${this._name}] ${str}`);
    }

    private _warn(str: string) {
        Logger.warn(`[${this._name}] ${str}`);
    }

    private _error(str: string) {
       Logger.error(`[${this._name}] ${str}`);
    }

    public addRef(channel: string, connKey: string, conn: any, peerName: string, callback?: ChannelConnectionMap.MapHandler) {
        this._info(`AddRef: '${channel}', connKey = ${connKey}`);

        let connsMap = this._channelsMap.get(channel);
        if (connsMap == null) {
            connsMap = new Map<string, ChannelConnectionMap.ConnectionData>();
            // This channel has NOT been subscribed yet, add it to the map
            this._channelsMap.set(channel, connsMap);
            // this._info(`AddRef: channel '${channel}' is added`);
        }
        let connData = connsMap.get(connKey);
        if (connData == null) {
            // This channel has NOT been already subscribed by this connection
            connData = new ChannelConnectionMap.ConnectionData(connKey, conn);
            connsMap.set(connKey, connData);
            // this._info(`AddRef: connKey = ${connKey} is added`);
        }
        let count = connData.peerNames.get(peerName);
        if (count == null) {
            // This channel has NOT been already subcribed by this peername, by default 1
            count = 1;
            // this._info(`AddRef: peerName #${peerName} is added`);
        }
        else {
            ++count;
        }
        connData.peerNames.set(peerName, count);
        this._info(`AddRef: '${channel}', connKey = ${connKey}, count = ${connData.peerNames.size}`);
        if ((callback instanceof Function) === true) {
            callback(channel, peerName, connData);
        }
    }

    private _release(channel: string, connKey: string, peerName: string, removeAll: boolean, callback?: ChannelConnectionMap.MapHandler) {
        this._info(`Release: '${channel}', connKey = ${connKey}`);

        let connsMap = this._channelsMap.get(channel);
        if (connsMap == null) {
            this._warn(`Release: '${channel}' is unknown`);
        }
        else {
            let connData = connsMap.get(connKey);
            if (connData == null) {
                this._warn(`Release: connKey = ${connKey} is unknown`);
            }
            else {
                if (peerName == null) {
                    let peerNamesTemp = new Array<string>();
                    for (let peerName of connData.peerNames.keys()) {
                        peerNamesTemp.push(peerName);
                    }
                    let len = peerNamesTemp.length;
                    // Test callback first to manage performance
                    if ((callback instanceof Function) === true) {
                        for (let i = 0; i < len; ++i) {
                            connData.peerNames.delete(peerNamesTemp[i]);
                            callback(channel, peerNamesTemp[i], connData);
                        }
                    }
                    else {
                        for (let i = 0; i < len; ++i) {
                            connData.peerNames.delete(peerNamesTemp[i]);
                        }
                    }
                }
                else {
                    let count = connData.peerNames.get(peerName);
                    if (count == null) {
                        this._warn(`Release: peerName #${peerName} is unknown`);
                    }
                    else {
                        if (removeAll) {
                            if ((callback instanceof Function) === true) {
                                while (count > 0) {
                                    --count;
                                     connData.peerNames.set(peerName, count);
                                     callback(channel, peerName, connData);
                                }
                            }
                            connData.peerNames.delete(peerName);
                        }
                        else {
                            // This connection has subscribed to this channel
                            --count;
                            if (count > 0) {
                                connData.peerNames.set(peerName, count);
                            } else {
                                // The connection is no more referenced
                                connData.peerNames.delete(peerName);
                                // this._info(`Release: peerName #${peerName} is released`);
                            }
                            if ((callback instanceof Function) === true) {
                                callback(channel, peerName, connData);
                            }
                        }
                    }
                }
                if (connData.peerNames.size === 0) {
                    connsMap.delete(connKey);
                    // this._info(`Release: conn = ${connKey} is released`);
                    if (connsMap.size === 0) {
                        this._channelsMap.delete(channel);
                        // this._info(`Release: channel '${channel}' is released`);
                    }
                }
                this._info(`Release: '${channel}', connKey = ${connKey}, count = ${connData.peerNames.size}`);
            }
        }
    }

    public release(channel: string, connKey: string, peerName: string, callback?: ChannelConnectionMap.MapHandler) {
        this._release(channel, connKey, peerName, false, callback);
    }

    public releaseAll(channel: string, connKey: string, peerName: string, callback?: ChannelConnectionMap.MapHandler) {
        this._release(channel, connKey, peerName, true, callback);
    }

    public releaseConnection(connKey: string, callback?: ChannelConnectionMap.MapHandler) {
        this._info(`ReleaseConn: connKey = ${connKey}`);

        // Store keys in an intermediate array
        // Not sure iterating and removing at the same time is well supported 
        let channelsTmp = new Array<string>();
        for (let channel of this._channelsMap.keys()) {
            channelsTmp.push(channel);
        }
        let len = channelsTmp.length;
        for (let i = 0; i < len; ++i) {
            this._release(channelsTmp[i], connKey, null, false, callback);
        }
    }

    public forEachChannel(channel: string, callback: ChannelConnectionMap.ForEachHandler) {
        this._info(`forEachChannel: '${channel}'`);

        if ((callback instanceof Function) === false) {
            this._error('forEachChannel: No callback provided !');
            return;
        }

        let connsMap = this._channelsMap.get(channel);
        if (connsMap == null) {
            this._warn(`forEachChannel: Unknown channel '${channel}' !`);
        }
        else {
            connsMap.forEach((connData, connKey) => {
                this._info(`forEachChannel: '${channel}', connKey = ${connKey} (${connData.peerNames.size})`);
                callback(connData, channel);
            });
        }
    }

    public forEach(callback: ChannelConnectionMap.ForEachHandler) {
        this._info('forEach');

        if ((callback instanceof Function) === false) {
            this._error('forEach: No callback provided !');
            return;
        }

        this._channelsMap.forEach((connsMap, channel: string) => {
            connsMap.forEach((connData, connKey) => {
                this._info(`forEach: '${channel}', connKey = ${connKey} (${connData.peerNames.size})`);
                callback(connData, channel);
            });
        });
    }
}

/** @internal */
export namespace ChannelConnectionMap {
    /** @internal */
    export class ConnectionData {
        readonly connKey: string;
        readonly conn: any;
        peerNames: Map<string, number> = new Map<string, number>();

        constructor(connKey: string, conn: any) {
            this.connKey = connKey;
            this.conn = conn;
        }
    }

    /** @internal */
    export interface MapHandler {
        (channel: string, peerName: string, connData: ConnectionData): void;
    };

    /** @internal */
    export interface ForEachHandler {
        (ConnectionData: ConnectionData, channel: string): void;
    };
};

