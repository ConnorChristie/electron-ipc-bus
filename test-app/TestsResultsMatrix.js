"use strict";

var processes = [ "###", "master", "renderer", "node" ];
var debugTimeout = 5;

// IPC names
var ipcName_Module = "ipc-test-app";
// dispatch to processes
var ipcName_DispatchToMaster = ipcName_Module + "/dispatch-to-master";
var ipcName_DispatchToRenderer = ipcName_Module + "/dispatch-to-renderer";
var ipcName_DispatchToNode = ipcName_Module + "/dispatch-to-node";

function initResultsMatrix(htmlTable) {
    processes.forEach(function(nameRow) {
        let newRow = document.createElement("tr");
        if (nameRow == processes[0]) {
            let classFirstRow = document.createAttribute("class");
            classFirstRow.value = "FirstRow";
            newRow.setAttributeNode(classFirstRow);
        }
        processes.forEach(function(nameCol) {
            let newCol = document.createElement("td");
            if (nameRow == processes[0]) {
                if (nameCol == processes[0]) {
                    newCol.innerHTML = "RESULTS";
                }
                else {
                    newCol.innerHTML = nameCol;
                }
            }
            else if (nameCol == processes[0]) {
                newCol.innerHTML = nameRow;
                let classFirstColumn = document.createAttribute("class");
                classFirstColumn.value = "FirstColumn";
                newCol.setAttributeNode(classFirstColumn);
            }
            else {
                // console.info("%s -> %s", nameRow, nameCol);
                let attrId = document.createAttribute("id");
                attrId.value = "IPC_TEST_" + nameRow + "_2_" + nameCol;
                newCol.setAttributeNode(attrId);
                let attrOnClick = document.createAttribute("onclick");
                attrOnClick.value = "onCellClicked('" + nameRow + "', '" + nameCol + "')";
                newCol.setAttributeNode(attrOnClick);
                newCol.innerHTML = "Not started";
            }
            newRow.appendChild(newCol);
        });
        htmlTable.appendChild(newRow);
    });
};

function onCellClicked(emitter, receiver) {
    // console.debug("Cell clicked: %s/%s", emitter, receiver);
    let cellId = "IPC_TEST_" + emitter + "_2_" + receiver;
    let sourceCell = document.getElementById(cellId);
    let backgroundColor = document.createAttribute("style");
    backgroundColor.value = "color:white;background-color:red";
    sourceCell.setAttributeNode(backgroundColor);
    let date = new Date();
    sourceCell.innerHTML = date.getTime();
    // set the emitter channel
    let ipcChannel = "";
    if (emitter.lastIndexOf("master") == 0) {
        ipcChannel = ipcName_DispatchToMaster;
    }
    else if (emitter.lastIndexOf("renderer") == 0) {
        ipcChannel = ipcName_DispatchToRenderer;
    }
    else if (emitter.lastIndexOf("node") == 0) {
        ipcChannel = ipcName_DispatchToNode;
    }
    setTimeout(function() {
        let strJSON = '{ "emitter": "' + emitter + '", "receiver": "' + receiver + '"}';
        ipcBus.send(ipcChannel, strJSON);
    }, debugTimeout);
};

function onIPCBus_MessageReceived(topic, message) {
    if (processToMonitor.Type() == "main") {
        // console.debug("Message received on '%s': '%s'", topic, message);
        let cellId = "IPC_TEST_" + message + "_2_" + topic;
        let targetCell = document.getElementById(cellId);
        let backgroundColor = document.createAttribute("style");
        backgroundColor.value = "color:white;background-color:green";
        targetCell.setAttributeNode(backgroundColor);
        let date = new Date();
        targetCell.innerHTML = date.getTime() - targetCell.innerHTML;
    }
};

var processToMonitor = null;
ipcRenderer.on("initializeWindow", function (event, data) {
    const args = (data !== undefined)? data: event;

    if (args["type"] == "main") {
        // init the Matrix
        let matrixElement = document.getElementById("TestsResultsMatrix");
        initResultsMatrix(matrixElement);
        // and show the panel
        let matrixDiv = document.getElementById("MatrixPanel");
        matrixDiv.style.display = "block";

        // init the processToMonitor
        processToMonitor = new ProcessConnector("main", ipcRenderer);
        // connect to ipcBus
        ipcBus.connect(function () {
            ipcBus.subscribe(ipcName_DispatchToMaster, onIPCBus_MasterDispatch);
        });
    }
    else if (args["type"] == "renderer") {
        // init the processToMonitor
        processToMonitor = new ProcessConnector("renderer", args["id"], ipcRenderer);
        // connect to ipcBus
        ipcBus.connect(function () {
            ipcBus.subscribe(ipcName_DispatchToRenderer, onIPCBus_RendererDispatch);
        });
    }
    else if (args["type"] == "node") {
        // init the processToMonitor
        processToMonitor = new ProcessConnector("node", args["id"], ipcRenderer);
        // connect to ipcBus
        ipcBus.connect(function () {
            ipcBus.subscribe(ipcName_DispatchToNode, onIPCBus_NodeDispatch);
        });
    }
});

function onIPCBus_MasterDispatch(topic, message) {
    if (processToMonitor.Type() == "main") {
        // console.debug("Master Dispatch: %s - %s", topic, message);
        let msg = JSON.parse(message);
        onIPCBus_MessageReceived(msg["receiver"], msg["emitter"]);
    }
};

function onIPCBus_RendererDispatch(topic, message) {
    if (processToMonitor.Type() == "renderer") {
        // console.debug("Renderer Dispatch: %s - %s", topic, message);
        let msg = JSON.parse(message);
        setTimeout(function() {
            ipcBus.send(ipcName_DispatchToMaster, message);
        }, debugTimeout);
    }
};

function onIPCBus_NodeDispatch(topic, message) {
    if (processToMonitor.Type() == "node") {
        // console.debug("Node Dispatch: %s - %s", topic, message);
        let msg = JSON.parse(message);
        setTimeout(function() {
            ipcBus.send(ipcName_DispatchToMaster, message);
        }, debugTimeout);
    }
};

function doRunTests() {
    initProcesses();
    processes.forEach(function(row) {
        if (row != processes[0]) {
            processes.forEach(function(column) {
                if (column != processes[0]) {
                    setTimeout(function() {
                        onCellClicked(row, column);
                    }, debugTimeout);
                }
            });
            }
    });
};

function initProcesses() {
    processes.forEach(function(nameRow) {
        if (nameRow != processes[0]) {
            if (nameRow.lastIndexOf("master") == 0) {
                ; // nothing to do here
            }
            else if (nameRow.lastIndexOf("renderer") == 0) {
                processToMonitor.send("new-process", "renderer");
            }
            else if (nameRow.lastIndexOf("node") == 0) {
                processToMonitor.send("new-process", "node");
            }
        }
    });
};
