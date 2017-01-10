
import * as IpcBusInterfaces from './IpcBusInterfaces';
export * from './IpcBusInterfaces';

import { IpcBusBrokerClient } from './IpcBusBroker';
import * as IpcBusUtils from './IpcBusUtils';

/** @internal */
export function CreateIpcBusBroker(busPath?: string): IpcBusInterfaces.IpcBusBroker {
    let ipcBusBroker: IpcBusInterfaces.IpcBusBroker = null;

    let ipcOptions = IpcBusUtils.ExtractIpcOptions(busPath);
    if (ipcOptions.isValid()) {
        IpcBusUtils.Logger.info(`CreateIpcBusBroker ipc options = ${ipcOptions}`);
        ipcBusBroker = new IpcBusBrokerClient(ipcOptions) as IpcBusInterfaces.IpcBusBroker;
    }
    return ipcBusBroker;
}

import { IpcBusNodeClient } from './IpcBusNode';
import { IpcBusMainClient } from './IpcBusMain';
import { IpcBusRendererClient } from './IpcBusRenderer';
import * as ElectronUtils from './ElectronUtils';

// A single instance per process
let _ipcBusClient: IpcBusInterfaces.IpcBusClient = null;

/** @internal */
function CreateIpcBusForProcess(processType: string, busPath?: string): IpcBusInterfaces.IpcBusClient {
    let ipcOptions = IpcBusUtils.ExtractIpcOptions(busPath);
    IpcBusUtils.Logger.info(`CreateIpcBusForProcess process type = ${processType}, ipc options = ${ipcOptions}`);

    if (_ipcBusClient == null) {
        switch (processType) {
            case 'renderer':
                _ipcBusClient = new IpcBusRendererClient() as IpcBusInterfaces.IpcBusClient;
                break;

            case 'browser':
                if (ipcOptions.isValid()) {
                    _ipcBusClient = new IpcBusMainClient(ipcOptions) as IpcBusInterfaces.IpcBusClient;
                }
                break;

            default:
                if (ipcOptions.isValid()) {
                    _ipcBusClient = new IpcBusNodeClient(ipcOptions) as IpcBusInterfaces.IpcBusClient;
                }
                break;
        }
    }
    return _ipcBusClient;
}

/** @internal */
export function CreateIpcBus(busPath?: string): IpcBusInterfaces.IpcBusClient {
    return CreateIpcBusForProcess(ElectronUtils.GuessElectronProcessType(), busPath);
}