import {translate} from "../common/Translator.js";
import * as DataStorage from './DataStorage.js';
import {checkUpdates, openOptions, sendMessageToOffscreen} from "../common/Utils.js";

// Check updates.
chrome.runtime.onInstalled.addListener(function(details) {
    checkUpdates(details);
});

// Hotkeys listener
chrome.commands.onCommand.addListener(async (command) => {
    await DataStorage.init();
    await sendMessageToOffscreen(command);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'background') {
        return;
    }
    console.log('Message to background', message);

    // List of actions that call sendResponse
    const actionsWithResponse = [
        'like', 'dislike', 'exportData', 'importData', 'getStationByName', 'getLastName',
        'setLast', 'getStream', 'getNextStream', 'setVolume', 'deleteStation', 'restoreStation',
        'addStation', 'isFavorite', 'getStations', 'getFavorites', 'getVolumeLast', 'getVolume', 'getLastStation'
    ];

    if (actionsWithResponse.includes(message.action)) {
        (async () => {
            await DataStorage.init();
            let station;
            switch (message.action) {
                case 'like':
                    sendResponse(await DataStorage.like(message.data));
                    break;
                case 'dislike':
                    sendResponse(await DataStorage.dislike(message.data));
                    break;
                case 'exportData':
                    sendResponse(DataStorage.exportData());
                    break;
                case 'importData':
                    sendResponse(DataStorage.importData(message.data));
                    break;
                case 'getStationByName':
                    station = DataStorage.getStationByName(message.data);
                    sendResponse(station ? station.plain() : null);
                    break;
                case 'getLastName':
                    sendResponse(DataStorage.getLastName());
                    break;
                case 'setLast':
                    await DataStorage.setLast(message.data);
                    station = DataStorage.getStationByName(message.data);
                    sendResponse(station ? station.plain() : null);
                    break;
                case 'getStream':
                    station = DataStorage.getLastStation();
                    sendResponse(station ? station.getStream(message.data) : null);
                    break;
                case 'getNextStream':
                    station = DataStorage.getLastStation();
                    sendResponse(station ? station.getNextStream() : null);
                    break;
                case 'setVolume':
                    sendResponse(await DataStorage.setVolume(message.data));
                    break;
                case 'deleteStation':
                    sendResponse(await DataStorage.deleteStation(message.data));
                    break;
                case 'restoreStation':
                    sendResponse(await DataStorage.restoreStation(message.data));
                    break;
                case 'addStation':
                    sendResponse(await DataStorage.addStation(message.data));
                    break;
                case 'isFavorite':
                    sendResponse(DataStorage.isFavorite(message.data));
                    break;
                case 'getStations':
                    sendResponse(DataStorage.getStations());
                    break;
                case 'getFavorites':
                    sendResponse(DataStorage.getFavorites());
                    break;
                case 'getVolumeLast':
                    sendResponse(DataStorage.getVolumeLast());
                    break;
                case 'getVolume':
                    sendResponse(DataStorage.getVolume());
                    break;
                case 'getLastStation':
                    station = DataStorage.getLastStation();
                    sendResponse(station ? station.plain() : null);
                    break;
            }
        })();
        return true;
    } else {
        (async () => {
            await DataStorage.init();
            let station;
            switch (message.action) {
                case 'link':
                    station = DataStorage.getStationByName(message.data);
                    if (station) chrome.tabs.create({url: station.url});
                    break;
                case 'options':
                    openOptions(message.data);
                    break;
                case 'metadataReceived':
                    console.log('Background script received metadata:', message.data);
                    if (message.data && message.data.StreamTitle) {
                        console.log('Current playing song in background:', message.data.StreamTitle);
                    } else {
                        console.warn('Metadata received but no StreamTitle found:', message.data);
                    }
                    break;
                case 'buffering':
                    station = DataStorage.getLastStation();
                    chrome.action.setIcon({path: {'19': '../../images/19o.png', '38': '../../images/38o.png'}});
                    chrome.action.setTitle({title: station?.title + ' - ' + translate('loading')});
                    break;
                case 'playing':
                    station = DataStorage.getLastStation();
                    chrome.action.setIcon({path: {'19': '../../images/19g.png', '38': '../../images/38g.png'}});
                    chrome.action.setTitle({title: station?.title});
                    break;
                case 'stopped':
                    station = DataStorage.getLastStation();
                    chrome.action.setIcon({path: {'19': '../../images/19.png', '38': '../../images/38.png'}});
                    chrome.action.setTitle({title: station?.title + ' - ' + translate('stopped')});
                    break;
                case 'error':
                    station = DataStorage.getLastStation();
                    chrome.action.setIcon({path: {'19': '../../images/19r.png', '38': '../../images/38r.png'}});
                    chrome.action.setTitle({title: station?.title + ' - ' + translate('error')});
                    break;
                default:
                    chrome.action.setIcon({path: {'19': '../../images/19.png', '38': '../../images/38.png'}});
                    chrome.action.setTitle({title: translate('name')});
                    break;
            }
        })();
        // Do not return true here
    }
});
