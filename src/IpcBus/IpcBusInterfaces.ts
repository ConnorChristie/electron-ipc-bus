
export interface IpcBusConnectHandler {
    (eventName: string, conn: any): void;
}

export interface IpcBusRequestResolve {
    (resolve: Object | string) : void;
}

export interface IpcBusRequestReject {
    (err: string) : void;
}

export interface IpcBusTopicHandler {
    (topic: string, payload: Object | string, peerName: string, requestPromise?: IpcBusRequestResolve, requestReject?: IpcBusRequestReject): void;
}

export interface IpcBusRequestResponse {
    topic: string;
    payload: Object | string;
    peerName: string;
}

export interface IpcBusClient {
    connect(connectHandler: IpcBusConnectHandler): void;
    close(): void;
    subscribe(topic: string, topicHandler: IpcBusTopicHandler): void;
    unsubscribe(topic: string, topicHandler: IpcBusTopicHandler): void;
    send(topic: string, payload: Object | string): void;
    request(topic: string, data: Object | string, timeoutDelay?: number): Promise<IpcBusRequestResponse>;
    queryBrokerState(topic: string): void;
}

export interface IpcBusBroker {
    start(): void;
    stop(): void;
}

