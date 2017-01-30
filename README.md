# electron-ipc-bus
A safe IPC (Inter-Process Communication) bus for applications built on Electron. 

This bus offers a common API for exchanging data between any Electron process : Node instances, Master and Renderer instances.

# Features
* Publish/Subscribe oriented API
* Works with sandboxed renderer process
* Support for renderer affinity (several webpages hosted in the same renderer process)
* Remote calls/events and pending messages management with Services

# Installation
```Batchfile
npm install electron-ipc-bus
```

Dependencies
* https://github.com/oleics/node-easy-ipc
* https://github.com/pkrumins/node-lazy

# Usage

```js
// Load modules
const ipcBusModule = require("electron-ipc-bus");
const electronApp = require('electron').app;

// Configuration
const ipcBusPath = 50494;
// const ipcBusPath = '/myfavorite/path';

// Startup
electronApp.on('ready', function () {
    // Create broker
    const ipcBusBroker = ipcBusModule.CreateIpcBusBroker(ipcBusPath);

    // Start broker
    ipcBusBroker.start()

        // Create client
        .then((msg) => {
            const ipcBusClient = ipcBusModule.CreateIpcBusClient(ipcBusPath);
            ipcBusClient.connect()

                // Chatting on channel 'greeting'
                .then((msg) => {
                    ipcBusClient.addListener('greeting', (ipcBusEvent, greetingMsg) => {
                        if (ipcBusEvent.request) {
                            ipcBusEvent.request.resolve('thanks to you, dear #' + ipcBusEvent.sender.peerName);
                        }
                        else {
                            ipcBusClient.send('greeting-reply', 'thanks to all listeners')
                            console.log(greetingMsg);
                        }
                    });

                    ipcBusClient.addListener('greeting-reply', (ipcBusEvent, greetingReplyMsg) => {
                        console.log(greetingReplyMsg);
                    });

                    ipcBusClient.send('greeting', 'hello everyone!');

                    ipcBusClient.request(2000, 'greeting', 'hello partner!')
                        .then((ipcBusRequestResponse) => {
                            console.log(ipcBusRequestResponse.event.peerName + ' replied ' + ipcBusRequestResponse.payload);
                        });
                });
        });
});

```

# IpcBusBroker
Dispatching of messages is managed by a broker. You can have only one single Broker for the whole application.
The broker can be instanciated in a node process or in the master process (not in renderer processes).
For performance purpose, it is better to instanciate the broker in an independent node process.

## Interface
```ts
interface IpcBusBroker {
    start(timeoutDelay?: number): Promise<string>;
    stop(): void;
    queryState(): Object;
}
```
## Initialization of the Broker (in a node process)

```js
const ipcBusModule = require("electron-ipc-bus");
const ipcBusBroker = ipcBusModule.CreateIpcBusBroker([busPath]);
```

The ***require()*** call loads the module and CreateIpcBusBroker setups the broker with the ***busPath***.
If ***busPath*** is not specified, the framework tries to get it from the command line with switch ***--bus-path***.
 
Example with ***busPath*** set by code

```js
// Socket path
const ipcBusBroker = ipcBusModule.CreateIpcBusBroker('/my-ipc-bus-path');
```

```js
// Port number
const ipcBusBroker = ipcBusModule.CreateIpcBusBroker(58666);
```

Example with ***busPath*** set by command line:
```Batchfile
electron.exe --bus-path=58666
```
    
```js
const ipcBusBroker = ipcBusModule.CreateIpcBusBroker();
```

## Methods

### start([timeoutDelay]) : Promise < string >
- timeoutDelay : number (milliseconds)

```js
ipcBusBroker.start() 
    .then((msg) => console.log(msg))
    .catch((err) => console.log(err))
````

Starts the broker dispatcher.
If succeeded the value of ***msg*** is 'started' (do not rely on it, subject to change). 
If failed (timeout or any other internal error), ***err*** contains the error message.

### stop()

```js
ipcBusBroker.stop() 
```

### queryState() - for debugging purpose only

```js
var queryState = ipcBusBroker.queryState() 
````

Returns the list of pair <channel, peerName> subscriptions. Format may change from one version to another.
This information can be retrieved from an IpcBusClient through the channel : /electron-ipc-bus/queryState


# IpcBusClient
The ***IpcBusClient*** is an instance of the ***EventEmitter*** class.

When you register a callback to a specified channel. Each time a message is received on this channel, the callback is called.
The callback must follow the ***IpcBusListener*** signature (see below).

Only one ***IpcBusClient*** per Process/Renderer is created. If you ask for more, the same instance will be returned.

## Interface
```ts
interface IpcBusClient extends events.EventEmitter {
    readonly peerName: string;
    connect(timeoutDelay?: number): Promise<string>;
    close(): void;
    send(channel: string, ...args: any[]): void;
    request(timeoutDelay: number, channel: string, ...args: any[]): Promise<IpcBusRequestResponse>;

    // EventEmitter overriden API
    addListener(channel: string, listener: IpcBusListener): this;
    removeListener(channel: string, listener: IpcBusListener): this;
    on(channel: string, listener: IpcBusListener): this;
    once(channel: string, listener: IpcBusListener): this;
    off(channel: string, listener: IpcBusListener): this;

    // Added in Node 6...
    prependListener(channel: string, listener: IpcBusListener): this;
    prependOnceListener(channel: string, listener: IpcBusListener): this;
}
```

## Initialization in the Main/Browser Node process

```js
const ipcBusModule = require("electron-ipc-bus");
const ipcBus = ipcBusModule.CreateIpcBusClient([busPath]);
````

The ***require()*** call loads the module. CreateIpcBus setups the client with the ***busPath*** that was used to start the broker.
If ***busPath*** is not specified, the framework tries to get it from the command line with switch ***--bus-path***.
 
Example with ***busPath*** set by code:
```js
const ipcBus = ipcBusModule.CreateIpcBusClient('/my-ipc-bus-path');
```

Example with ***busPath*** set by command line:
```
electron.exe --bus-path='/my-ipc-bus-path'
```
```js    
const ipcBus = ipcBusModule.CreateIpcBusClient();
```

## Initialization in a Node single process
 
Example with ***busPath*** set by code:
```js
const ipcBus = ipcBusModule.CreateIpcBusClient('/my-ipc-bus-path');
```
Example with ***busPath*** set by command line:
```
electron.exe --bus-path='/my-ipc-bus-path'
```
```js 
const ipcBus = ipcBusModule.CreateIpcBusClient();
```
## Initialization in a Renderer process (either sandboxed or not)
```js
const ipcBusModule = require("electron-ipc-bus");
const ipcBus = ipcBusModule.CreateIpcBusClient();
```

NOTE: If the renderer is running in sandboxed mode, the above code must be run from the ***BrowserWindow***'s preload script (browserify -o BundledBrowserWindowPreload.js ***-x electron*** BrowserWindowPreload.js). 
Otherwise, the Electron's ipcRenderer is not accessible and the client cannot work.
Use the code below to make the client accessible to the the Web page scripts.
```js
window.ipcBus = require('electron-ipc-bus').CreateIpcBusClient();
```

## Property

### peerName
For debugging purpose, each ***IpcBusClient*** is identified by a peerName. 
The peerName is unique and computed from the type of the process: 
- Master
- Renderer + WebContents Id
- Node + Process Id

## Connectivity Methods

### connect([timeoutDelay]) : Promise < string >
- ***timeoutDelay***: number (milliseconds)

```js
ipcBus.connect().then((eventName) => console.log("Connected to Ipc bus !"))
```

### close()
```js
ipcBus.close()
```

### addListener(channel, listener)
- ***channel***: string
- ***listener***: IpcBusListener

Listens to ***channel***, when a new message arrives ***listener*** would be called with listener(event, args...).

NOTE: ***on***, ***prependListener***, ***once*** and ***prependOnceListener*** methods are supported as well

### removeListener(channel, listener)
- ***channel***: string
- ***listener***: IpcBusListener

Removes the specified ***listener*** from the listeners array for the specified ***channel***.

NOTE: ***off*** method is supported as well

### removeAllListeners([channel])
***channel***: String (optional)

Removes all listeners, or those of the specified ***channel***.

## IpcBusListener(event, ...args) callback
- ***event***: IpcBusEvent
- ***...args***: any[]): void

The first parameter of the callback is always an event which contains the channel and the origin of the message (sender).

```js
function HelloHandler(ipcBusEvent, content) {
    console.log("Received '" + content + "' on channel '" + ipcBusEvent.channel +"' from #" + ipcBusEvent.sender.peerName)
}
ipcBus.on("Hello!", HelloHandler)
```

## Posting Methods
### send(channel [, ...args])
- ***channel***: string
- ***...args***: any[]

Sends a message asynchronously via ***channel***, you can also send arbitrary arguments. 
Arguments will be serialized in JSON internally and hence no functions or prototype chain will be included.

```js
ipcBus.send("Hello!", { name: "My age !"}, "is", 10)
```

### request(timeoutDelay, channel [, ...args]) : Promise < IpcBusRequestResponse >
- ***timeoutDelay***: number (milliseconds)
- ***channel***: string
- ***...args***: any[]

Sends a request message on specified ***channel***. The returned Promise is settled when a result is available. 
The ***timeoutDelay*** defines how much time we're waiting for the response.
The Promise provides an ***IpcBusRequestResponse*** object:
```ts
interface IpcBusRequestResponse {
    event: IpcBusEvent;
    payload?: Object | string;
    err?: string;
}
```

```js
ipcBus.request(2000, "compute", "2*PI*9")
    .then(ipcBusRequestResponse) {
        console.log("channel = " + ipcBusRequestResponse.event.channel + ", response = " + ipcBusRequestResponse.payload + ", from = " + ipcBusRequestResponse.event.sender.peerName);
     }
     .catch(ipcBusRequestResponse) {
        console.log("err = " + ipcBusRequestResponse.err);
     }
```

## IpcBusEvent object
```ts
interface IpcBusEvent {
    channel: string;
    sender: IpcBusSender {
        peerName: string;
    };
    request?: IpcBusRequest {
        resolve(payload: Object | string): void;
        reject(err: string): void;
    };
}
```
The event object passed to the listener has the following properties:
### event.channel: string
***channel*** delivering the message

### event.sender.peerName: string
***peerName*** of the sender

### event.request [optional]: IpcBusRequest
If present, the message is a request.
Listener can resolve the request by calling ***event.request.resolve()*** with the response or can reject the request by calling ***event.request.reject()*** with an error message.


# IpcBusService
The ***IpcBusService*** creates an IPC endpoint that can be requested via remote calls and send events.

## Interface
```ts
interface IpcBusService {
    start(): void;
    stop(): void;
    registerCallHandler(name: string, handler: IpcBusServiceCallHandler): void;
    sendEvent(eventName: string, ...args: any[]): void;
}
```

## IpcBusServiceCall
Message sent to a service to execute a remote call.
```ts
interface IpcBusServiceCall {
    handlerName: string;
    args: any[];
}
```

## IpcBusServiceCallHandler
Prototype of a method that will be executed to handle a service's call.
```ts
interface IpcBusServiceCallHandler {
    (call: IpcBusServiceCall, request: IpcBusRequest): void;
}
```

## Creation
```js
const ipcBusModule = require("electron-ipc-bus");
...
// ipcBusClient is a connected instance of IpcBusClient
const ipcMyService = ipcBusModule.CreateIpcBusService(ipcBusClient, 'myService');
```

## Methods

### start(): void
This makes the service to listen and serve incoming remote calls.
The service also sends the ***IPCBUS_SERVICE_EVENT_START*** event.

### stop(): void
This makes the service to stop listen and serve incoming remote calls.
The service also sends the ***IPCBUS_SERVICE_EVENT_STOP*** event.

### registerCallHandler(name, handler): void
- ***name***: string
- ***handler***: IpcBusServiceCallHandler
This sets the function that will be executed to serve the specified remote call.
As this is run in the context of a promise, the function must call either request.resolve()
or request.reject() to fulfill the promise.
```js
ipcMyService.registerCallHandler('getCurrentTime', (call, request) => {
                        try {                        {
                            request.resolve(new Date().getTime());
                        } catch(e) {
                            request.reject(e);
                        }
                    });
```

### sendEvent(name, ...args): void
- ***name***: string
- ***args***: any[]
This sends a service event message.
```js
ipcMyService.sendEvent('timeChanged', new Date().getTime());
```


# IpcBusServiceProxy
The ***IpcBusServiceProxy*** creates an IPC endpoint that can be used to execute calls on a service and listen its events.

## Interface
```ts
interface IpcBusServiceProxy {
    isAvailable: boolean;
    checkAvailability(): Promise<boolean>;
    call<T>(handlerName: string, timeout: number, ...args: any[]): Promise<T>;
    addListener(event: string, listener: IpcBusServiceEventHandler): this;
    removeListener(event: string, listener: IpcBusServiceEventHandler): this;
    on(event: string, listener: IpcBusServiceEventHandler): this;
    once(event: string, listener: IpcBusServiceEventHandler): this;
    off(event: string, listener: IpcBusServiceEventHandler): this;
    removeAllListeners(event?: string): this;
    prependListener(event: string, listener: IpcBusServiceEventHandler): this;
    prependOnceListener(event: string, listener: IpcBusServiceEventHandler): this;
```

## IpcBusServiceEvent
Message sent to a service's proxy to trigger the code associated to this event.
```ts
interface IpcBusServiceEvent {
    eventName: string;
    args: any[];
}
```

## IpcBusServiceEventHandler
Prototype of a method that will be executed to handle a service's call.
```ts
interface IpcBusServiceEventHandler {
    (event: IpcBusServiceEvent): void;
}
```

## Creation
```js
const ipcBusModule = require("electron-ipc-bus");
...
// ipcBusClient is a connected instance of IpcBusClient
const ipcMyServiceProxy = ipcBusModule.CreateIpcBusServiceProxy(ipcBusClient, 'myService');
```

## Properties

### isAvailable: boolean
Availability of the associated service (available means that the service is started).

## Methods

### checkAvailability(): Promise< boolean >
This asynchronously requests the service availability to the Broker.
```js
ipcMyServiceProxy.checkAvailability()
        .then(
            (availability) => console.log(`MyService availability = ${availability}`),
            (err) => console.log(`Failed to get MyService availability (${err})`));
```

### call<T>(handlerName: string, timeout: number, ...args: any[]): Promise< T >
- ***handlerName***: string
- ***timeout***: number
- ***args***: any[]
This sends a service event message.
```js
ipcMyServiceProxy.call('getCurrentTime', 2000)
        .then(
            (currentTime) => console.log(`Current Time = ${currentTime}`),
            (err) => console.log(`Failed to get current time : ${err}`));
```


# Test application
The test-app folder contains all sources of the testing application.

NOTE: This folder is not packaged by NPM.

To build the application:
```
cd examples
cd test-app
npm install
npm run build
```

To run the application:
```
npm run start
```

To run the application in sandboxed mode:
```
npm run start-sandboxed
```


# Possible enhancements
* Support several brokers each with its own buspath in order to distribute the traffic load.
* Universal logger working in any kind of context (especially from a renderer).
* Define a friendly peerName


# MIT License

Copyright (c) 2017 Michael Vasseur and Emmanuel Kimmerlin

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.