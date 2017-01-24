/// <reference types='node' />
import events = require('events');


export interface IpcBusRequest {
    resolve(payload: Object | string): void;
    reject(err: string): void;
}

export interface IpcBusRequestResponse {
    event: IpcBusEvent;
    payload?: Object | string;
    err?: string;
}

export interface IpcBusSender {
    peerName: string;
}

export interface IpcBusEvent {
    channel: string;
    request?: IpcBusRequest;
    sender: IpcBusSender;
}

export interface IpcBusClient extends events.EventEmitter {
    readonly peerName: string;
    connect(timeoutDelay?: number): Promise<string>;
    close(): void;
    send(channel: string, ...args: any[]): void;
    request(timeoutDelay: number, channel: string, ...args: any[]): Promise<IpcBusRequestResponse>;
}

export interface IpcBusBroker {
    start(timeoutDelay?: number): Promise<string>;
    stop(): void;
    queryState(): Object;
}

