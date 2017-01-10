// Constants
export const IPC_BUS_RENDERER_SUBSCRIBE = 'IPC_BUS_RENDERER_SUBSCRIBE';
export const IPC_BUS_RENDERER_UNSUBSCRIBE = 'IPC_BUS_RENDERER_UNSUBSCRIBE';
export const IPC_BUS_RENDERER_SEND = 'IPC_BUS_RENDERER_SEND';
export const IPC_BUS_RENDERER_REQUEST = 'IPC_BUS_RENDERER_REQUEST';
export const IPC_BUS_RENDERER_RECEIVE = 'IPC_BUS_RENDERER_RECEIVE';
export const IPC_BUS_RENDERER_QUERYSTATE = 'IPC_BUS_RENDERER_QUERYSTATE';

export const IPC_BUS_COMMAND_SUBSCRIBETOPIC = 'subscribeTopic';
export const IPC_BUS_COMMAND_UNSUBSCRIBETOPIC = 'unsubscribeTopic';
export const IPC_BUS_COMMAND_SENDMESSAGE = 'sendMessage';
export const IPC_BUS_COMMAND_REQUESTMESSAGE = 'requestMessage';
export const IPC_BUS_COMMAND_QUERYSTATE = 'queryState';
export const IPC_BUS_EVENT_SENDMESSAGE = 'onSendMessage';
export const IPC_BUS_EVENT_REQUESTMESSAGE = 'onRequestMessage';

function uuid(): string {
    return Math.random().toString(36).substring(2, 14) + Math.random().toString(36).substring(2, 14);
}

/** @internal */
export function GenerateReplyTopic(): string {
    return 'replyTopic/' + uuid();
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
export class TopicConnectionMap {
    private _name: string;
    private _topicsMap: Map<string, Map<any, Map<string, number>>>;

    constructor(name: string) {
        this._name = name;
        this._topicsMap = new Map<string, Map<any, Map<string, number>>>();
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

    public addRef(topic: string, conn: any, peerName: string, callback?: TopicConnectionMap.MapHandler) {
        this._info(`AddRef: '${topic}', conn = ${conn}`);

        let connsMap = this._topicsMap.get(topic);
        if (connsMap == null) {
            connsMap = new Map<any, Map<string, number>>();
            // This topic has NOT been subscribed yet, add it to the map
            this._topicsMap.set(topic, connsMap);
            this._info(`AddRef: topic '${topic}' is added`);
        }
        let peerNamesMap = connsMap.get(conn);
        if (peerNamesMap == null) {
            // This topic has NOT been already subscribed by this connection
            peerNamesMap = new Map<string, number>();
            connsMap.set(conn, peerNamesMap);
            this._info(`AddRef: conn = ${conn} is added`);
        }
        let count = peerNamesMap.get(peerName);
        if (count == null) {
            // This topic has NOT been already subcribed by this peername, by default 1
            count = 1;
            this._info(`AddRef: peerName #${peerName} is added`);
        }
        else {
            ++count;
        }
        peerNamesMap.set(peerName, count);
        this._info(`AddRef: topic '${topic}', conn = ${conn}, count = ${peerNamesMap.size}`);
        if ((callback instanceof Function) === true) {
            callback(topic, conn, peerName, peerNamesMap.size);
        }
    }

    private _release(topic: string, conn: any, peerName?: string, callback?: TopicConnectionMap.MapHandler) {
        this._info(`Release: '${topic}', conn = ${conn}`);

        let connsMap = this._topicsMap.get(topic);
        if (connsMap == null) {
            this._warn(`Release: '${topic}' is unknown`);
        }
        else {
            let peerNamesMap = connsMap.get(conn);
            if (peerNamesMap == null) {
                this._warn(`Release: conn = ${conn} is unknown`);
            }
            else {
                if (peerName == null) {
                    let peerNamesTemp = new Array<string>();
                    for (let peerName of peerNamesMap.keys()) {
                        peerNamesTemp.push(peerName);
                    }
                    // Test callback first to manage performance
                    if ((callback instanceof Function) === true) {
                        for (let peerName of peerNamesTemp) {
                            peerNamesMap.delete(peerName);
                            callback(topic, conn, peerName, peerNamesMap.size);
                        }
                    }
                    else {
                        for (let peerName of peerNamesTemp) {
                            peerNamesMap.delete(peerName);
                        }
                    }
                }
                else {
                    let count = peerNamesMap.get(peerName);
                    if (count == null) {
                        this._warn(`Release: peerName #${peerName} is unknown`);
                    }
                    else {
                        // This connection has subscribed to this topic
                        --count;
                        if (count > 0) {
                            peerNamesMap.set(peerName, count);
                        } else {
                            // The connection is no more referenced
                            peerNamesMap.delete(peerName);
                            this._info(`Release: peerName #${peerName} is released`);
                        }
                    }
                    if ((callback instanceof Function) === true) {
                        callback(topic, conn, peerName, peerNamesMap.size);
                    }
                }
                if (peerNamesMap.size === 0) {
                    connsMap.delete(conn);
                    this._info(`Release: conn = ${conn} is released`);
                    if (connsMap.size === 0) {
                        this._topicsMap.delete(topic);
                        this._info(`Release: topic '${topic}' is released`);
                    }
                }
                this._info(`Release: topic '${topic}', conn = ${conn}, count = ${peerNamesMap.size}`);
            }
        }
    }

    public release(topic: string, conn: any, peerName: string, callback?: TopicConnectionMap.MapHandler) {
        this._release(topic, conn, peerName, callback);
    }

    public releaseConnection(conn: any, callback?: TopicConnectionMap.MapHandler) {
        this._info(`ReleaseConn: conn = ${conn}`);

        // Store keys in an intermediate array
        // Not sure iterating and removing at the same time is well supported 
        let topicsTmp = new Array<string>();
        for (let topic of this._topicsMap.keys()) {
            topicsTmp.push(topic);
        }
        for (let topic of topicsTmp) {
            this._release(topic, conn, null, callback);
        }
    }

    public forEachTopic(topic: string, callback: TopicConnectionMap.ForEachHandler) {
        this._info(`ForEachTopic: '${topic}'`);

        if ((callback instanceof Function) === false) {
            this._error('ForEachTopic: No callback provided !');
            return;
        }

        let connsMap = this._topicsMap.get(topic);
        if (connsMap == null) {
            this._warn(`ForEachTopic: Unknown topic '${topic}' !`);
        }
        else {
            connsMap.forEach((peerNames: Map<string, number>, conn: any) => {
                this._info(`ForEachTopic: '${topic}', conn = ${conn} (' + ${peerNames.size} )`);
                callback(peerNames, conn, topic);
            });
        }
    }

    public forEach(callback: TopicConnectionMap.ForEachHandler) {
        this._info('forEach');

        if ((callback instanceof Function) === false) {
            this._error('ForEach: No callback provided !');
            return;
        }

        this._topicsMap.forEach((connsMap: Map<any, Map<string, number>>, topic: string) => {
            connsMap.forEach((peerNames: Map<string, number>, conn: any) => {
                this._info(`forEachConnection: '${topic}', conn = ${conn} (' + ${peerNames.size} )`);
                callback(peerNames, conn, topic);
            });
        });
    }
}

/** @internal */
export namespace TopicConnectionMap {
    export interface MapHandler {
        (topic: string, conn: any, peerName: string, peerNamesCount: number): void;
    };

    export interface ForEachHandler {
        (peernNames: Map<string, number>, conn: any, topic: string): void;
    };
};

