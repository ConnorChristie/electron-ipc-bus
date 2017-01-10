
import * as IpcBusInterfaces from "./IpcBus/IpcBusInterfaces";

import { IpcBusBrokerClient } from "./IpcBus/IpcBusBroker";

// tslint:disable-next-line:typedef-whitespace
export function CreateIPCBusBroker(busPath?: string): IpcBusInterfaces.IpcBusBroker {
    return new IpcBusBrokerClient(busPath) as IpcBusInterfaces.IpcBusBroker;
}

import { IpcBusNodeClient } from "./IpcBus/IpcBusNode";
import { IpcBusMasterClient } from "./IpcBus/IpcBusMaster";
import { IpcBusRendererClient } from "./IpcBus/IpcBusRenderer";

export enum ProcessType {
    Node,
    Browser,
    Renderer
}

export function CreateIPCBusClient(processType: ProcessType, busPath?: string): IpcBusInterfaces.IpcBusClient {
    console.log("CreateIPCBusClient process type = " + processType + ", busPath = " + busPath);
    switch (processType) {
        case ProcessType.Renderer:
            return new IpcBusRendererClient() as IpcBusInterfaces.IpcBusClient;

        case ProcessType.Browser:
            return new IpcBusMasterClient(busPath) as IpcBusInterfaces.IpcBusClient;

        case ProcessType.Node:
            return new IpcBusNodeClient(busPath) as IpcBusInterfaces.IpcBusClient;

        default:
            return new IpcBusNodeClient(busPath) as IpcBusInterfaces.IpcBusClient;
    }
}