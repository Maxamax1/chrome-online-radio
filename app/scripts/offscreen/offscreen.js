import IcecastPlayer from './IcecastPlayer.js';
import {sendMessageToBackground, sendMessageToPopup} from "../common/Utils.js";

/**
 * Retry on error counter.
 * @type {number}
 * @private
 */
let _attempts = 0;

/**
 * Max retry attempts
 * @type {number}
 * @private
 */
const MAX_ATTEMPTS = 3;

/**
 * Statuses.
 * @const
 * @type {{BUFFERING: string, PLAYING: string, STOPPED: string, ERROR: string}}
 */
const STATUS = {
    BUFFERING: 'buffering',
    PLAYING: 'playing',
    STOPPED: 'stopped',
    ERROR: 'error'
};

/**
 * Current status.
 * @type {string}
 * @private
 */
let _status = STATUS.STOPPED;

/**
 * Flag to prevent multiple operations at once
 * @type {boolean}
 */
let _isProcessing = false;

/**
 * Initialize player events.
 */
function initPlayerEvents() {
    player.attachEvent('play', () => {
        console.log('Player event: play');
        setStatus(STATUS.BUFFERING);
    });
    
    player.attachEvent('playing', () => {
        console.log('Player event: playing');
        _attempts = 0;
        setStatus(STATUS.PLAYING);
        _isProcessing = false;
    });
    
    player.attachEvent('abort', () => {
        console.log('Player event: abort');
        setStatus(STATUS.STOPPED);
        _isProcessing = false;
    });
    
    player.attachEvent('error', async (e) => {
        console.error('Player event: error', e);
        
        if (_status === STATUS.STOPPED) {
            _isProcessing = false;
            return;
        }

        if (_attempts++ < MAX_ATTEMPTS) {
            console.log(`Retry attempt ${_attempts}/${MAX_ATTEMPTS}`);
            try {
                const stream = await sendMessageToBackground('getNextStream');
                console.log('Retrying with next stream:', stream);
                // Short delay before retry
                setTimeout(() => {
                    player.play(stream);
                }, 500);
            } catch (error) {
                console.error('Error getting next stream:', error);
                _attempts = 0;
                setStatus(STATUS.ERROR);
                _isProcessing = false;
            }
        } else {
            _attempts = 0;
            setStatus(STATUS.ERROR);
            _isProcessing = false;
        }
    });
}

/**
 * Set radio playing status.
 * @param {string=} st
 */
function setStatus(st) {
    _status = st || STATUS.STOPPED;
    console.log('Status changed to:', _status);
    sendMessageToPopup(_status);
    sendMessageToBackground(_status);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') {
        return;
    }
    
    //console.log('Message to offscreen:', message);

    // Always return true to indicate asynchronous response
    const handleAsync = async () => {
        const action = message.action;
        const data = message.data;
        const volStep = 5;

        try {
            // Simple operations that can be handled immediately
            switch (action) {
                case 'getAudioData':
                    sendResponse(player.getAudioData());
                    return;
    
                case 'getMetadata':
                    console.log('Received getMetadata request from popup');
                    if (player && typeof player.getMetadata === 'function') {
                        const metadata = player.getMetadata();
                        console.log('Returning metadata to popup:', metadata);
                        sendResponse(metadata);
                    } else {
                        console.warn('getMetadata called but player or method not available');
                        sendResponse({});
                    }
                    return;
    
                case 'getStatus':
                    sendResponse(_status);
                    return;
                    
                case 'volume':
                    await sendMessageToBackground('setVolume', data);
                    // Scale from 0-20 to 0-100
                    player.setVolume(data);
                    sendResponse(true);
                    return;
    
                case 'volumeup':
                    // Get current volume (0-100), scale to 0-20
                    const volumeUp = Math.round(player.getVolume() / 5);
                    if (volumeUp < 20) {
                        player.setVolume((volumeUp + 1) * 5);
                    }
                    sendResponse(true);
                    return;
    
                case 'volumedown':
                    // Get current volume (0-100), scale to 0-20
                    const volumeDown = Math.round(player.getVolume() / 5);
                    if (volumeDown > 0) {
                        player.setVolume((volumeDown - 1) * 5);
                    }
                    sendResponse(true);
                    return;
            }
            
            // For operations that affect playback, ensure we're not already processing something
            if (_isProcessing) {
                console.log(`Operation '${action}' rejected - already processing another operation`);
                sendResponse(false);
                return;
            }
            
            _isProcessing = true;
            
            // Handle playback operations
            try {
                switch (action) {
                    case 'play':
                        const name = await sendMessageToBackground('getLastName');
                        if (data === name && player.isPlaying()) {
                            await player.stop();
                        } else {
                            const station = await sendMessageToBackground('setLast', data);
                            if (station && station.stream) {
                                await player.play(station.stream);
                            } else {
                                console.error('Invalid station or missing stream URL');
                            }
                        }
                        sendResponse(true);
                        break;
        
                    case 'playpause':
                        if (player.isPlaying()) {
                            await player.stop();
                        } else {
                            const station = await sendMessageToBackground('getLastStation');
                            if (station && station.stream) {
                                await player.play(station.stream);
                            } else {
                                console.error('No station to play');
                            }
                        }
                        sendResponse(true);
                        break;
        
                    case 'prev':
                    case 'next':
                        const stations = await sendMessageToBackground('getStations');
                        const keys = Object.keys(stations);
                        const length = keys.length;
                        const lastName = await sendMessageToBackground('getLastName');
                        const i = keys.indexOf(lastName);
                        const newName = (action === 'next') ? 
                            keys[(i + 1) % length] : 
                            keys[(length + i - 1) % length];
                            
                        const station = await sendMessageToBackground('setLast', newName);
                        if (station && station.stream) {
                            await player.play(station.stream);
                        } else {
                            console.error('Error switching to station:', newName);
                        }
                        sendResponse(true);
                        break;
        
                    case 'stream':
                        const stream = await sendMessageToBackground('getStream', data);
                        if (stream) {
                            await player.play(stream);
                        } else {
                            console.error('Error getting stream for:', data);
                        }
                        sendResponse(true);
                        break;
        
                    default:
                        console.warn(`Unexpected message type received: '${action}'`);
                        sendResponse(false);
                }
            } finally {
                _isProcessing = false;
            }
        } catch (error) {
            console.error(`Error handling message '${action}':`, error);
            _isProcessing = false;
            sendResponse(false);
        }
    };

    handleAsync().catch(err => {
        console.error('Unhandled error in message handler:', err);
        sendResponse(false);
    });

    return true; // Required to indicate asynchronous response
});

let player;
(async () => {
    try {
        console.log('Initializing IcecastPlayer...');
        player = new IcecastPlayer(await sendMessageToBackground('getVolume'));
        initPlayerEvents();
        setStatus();
        console.log('IcecastPlayer initialized successfully');
    } catch (error) {
        console.error('Error initializing IcecastPlayer:', error);
    }
})();
