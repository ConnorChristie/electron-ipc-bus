'use strict';

var processToMaster;
var transaction = 1;
function doPerformance(type) {
    var typeCommandElt = document.querySelector('.typeCommand');
    var testParams =
    {
        transaction: transaction,
        typeCommand: typeCommandElt.options[typeCommandElt.selectedIndex].text,
        typeArgs: type,
        bufferSize: 1024 * 1024
    };
    ++transaction;
    processToMaster.send('start-performance-tests', testParams);
}

var testStart = new Map;
var testStop = new Map;
var delays = [];

function doClear(event) {
     var table = document.getElementById('perfResults');
     while(table.rows.length > 1) {
          table.deleteRow(1);
     }
     testStart.clear();
     testStop.clear();
     delays = [];   
}

function doTraceEnable(event) {
    ipcBus.send('test-performance-trace', event.currentTarget.checked);
}

function onIPCBus_TestPerformanceStart(ipcBusEvent, msgTestStart) {
    var uuid = msgTestStart.uuid;
    testStart.set(uuid, msgTestStart);
    if (testStop.get(uuid)) {
        onIPCBus_TestPerformanceResult(uuid);
    }
}

function onIPCBus_TestPerformanceStop(ipcBusEvent, msgTestStop) {
    var uuid = msgTestStop.uuid;
    testStop.set(uuid, msgTestStop);
    if (testStart.get(uuid)) {
        onIPCBus_TestPerformanceResult(uuid);
    }
}

function onIPCBus_TestPerformanceResult(uuid) {
    var msgTestStart = testStart.get(uuid);
    var msgTestStop = testStop.get(uuid);
    if (msgTestStart && msgTestStop) {
        var delay = msgTestStop.stop.timeStamp - msgTestStart.start.timeStamp;
        delays.push(delay);
        delays.sort();

        var table = document.getElementById('perfResults');
        var row = table.insertRow(-1);
        var cell0 = row.insertCell(-1);
        var cell1 = row.insertCell(-1);
        var cell2 = row.insertCell(-1);
        var cell3 = row.insertCell(-1);
        cell0.innerHTML = `${msgTestStart.test.typeCommand} ${msgTestStart.test.typeArgs} (${msgTestStart.test.bufferSize})`;
        cell1.innerHTML = `#${msgTestStart.start.peerName} (${msgTestStart.type})`;
        cell2.innerHTML = `#${msgTestStop.stop.peerName} (${msgTestStop.type})`;
        cell3.setAttribute('delay', delay);
        cell3.innerHTML = `${delay}`;

        var q = (delays.length / 5);
        var q1 = Math.floor(q);
        var q2 = Math.floor(q * 2);                
        var q3 = Math.floor(q * 3);                
        var q4 = Math.floor(q * 4);                

        for (var i = 1; i < table.rows.length; ++i) {
            var curRow = table.rows[i];
            var delay = curRow.cells[3].getAttribute('delay');
            if (delay <= delays[q1]) {
                curRow.className = 'success';
                continue;
            } 
            if (delay <= delays[q2]) {
                curRow.className = 'info';
                continue;
            } 
            if (delay >= delays[q4]) {
                curRow.className = 'danger';
                continue;
            } 
            if (delay >= delays[q3]) {
                curRow.className = 'warning';
                continue;
            } 
            curRow.className = '';
        }
    }
}

var processToMaster = new ProcessConnector('browser', ipcRenderer);

ipcBus.connect()
    .then(() => {
        console.log('renderer : connected to ipcBus');
        ipcBus.on('test-performance-start', onIPCBus_TestPerformanceStart);
        ipcBus.on('test-performance-stop', onIPCBus_TestPerformanceStop);
    });

