export default class IcecastPlayer {
    constructor(volume) {
        this._events = {};
        this._volume = volume || 75;
        this._audioAnalyser = null;
        this._player = null;
        this._currentMetadata = {};
        this._playing = false;
        // Start with a fresh audio element
        this._createNewAudio();
    }

    /**
     * Creates a fresh audio element
     * @private
     */
    _createNewAudio() {
        // Clean up old audio element if it exists
        if (this._audio) {
            try {
                this._audio.pause();
                this._audio.src = '';
                this._audio.load();
                this._audio = null;
            } catch (e) {
                console.error('Error cleaning up audio element:', e);
            }
        }
        
        // Create fresh audio element
        this._audio = new Audio();
        this._audio.crossOrigin = 'anonymous';
        this._audio.volume = Number((this._volume / 100).toFixed(2));
        
        // Reset analyzer
        this._audioAnalyser = null;
    }

    /**
     * Attach event handler to player.
     * @param {string} name
     * @param {function} callback
     */
    attachEvent(name, callback) {
        if (!this._events[name]) {
            this._events[name] = [];
        }
        this._events[name].push(callback);
    }

    /**
     * Trigger event
     * @param {string} name 
     * @param {object=} data 
     * @private
     */
    _triggerEvent(name, data) {
        if (this._events[name]) {
            this._events[name].forEach(callback => callback(data));
        }
    }

    /**
     * Start playing.
     * @param {string=} url Stream (or file) url.
     */
    async play(url) {
        console.log('Play requested for URL:', url);
        
        // Stop any existing playback
        await this.stop();
        
        // Create a fresh audio element to avoid any issues with reusing old ones
        this._createNewAudio();
        
        // Trigger play event to show buffering
        this._triggerEvent('play');
        
        try {
            // Check if IcecastMetadataPlayer is available in the global scope
            if (typeof IcecastMetadataPlayer !== 'function') {
                throw new Error('IcecastMetadataPlayer is not loaded');
            }
            
            console.log('Creating new player for stream:', url);
            
            // Create the player instance with fresh audio element
            this._player = new IcecastMetadataPlayer(url, {
                audioElement: this._audio,
                metadataTypes: ['icy', 'ogg'],
                onMetadata: (metadata) => {
                    console.log('Raw metadata received from stream:', metadata);
                    
                    // Check if StreamTitle is directly on the metadata object
                    if (metadata && metadata.StreamTitle) {
                        this._currentMetadata = metadata;
                        console.log('Stream metadata detected directly on object:', this._currentMetadata);
                        
                        console.log('Current song title:', this._currentMetadata.StreamTitle);
                        
                        // Send metadata to background script for logging
                        try {
                            chrome.runtime.sendMessage({
                                target: 'background',
                                action: 'metadataReceived',
                                data: this._currentMetadata
                            });
                        } catch (e) {
                            console.error('Error sending metadata to background:', e);
                        }
                    }
                    // Original check for nested metadata (keep for backward compatibility)
                    else if (metadata && metadata.metadata) {
                        this._currentMetadata = metadata.metadata;
                        console.log('Stream metadata extracted from nested structure:', this._currentMetadata);
                        
                        if (this._currentMetadata.StreamTitle) {
                            console.log('Current song title:', this._currentMetadata.StreamTitle);
                        } else {
                            console.warn('No StreamTitle found in metadata:', this._currentMetadata);
                        }
                        
                        // Send metadata to background script for logging
                        try {
                            chrome.runtime.sendMessage({
                                target: 'background',
                                action: 'metadataReceived',
                                data: this._currentMetadata
                            });
                        } catch (e) {
                            console.error('Error sending metadata to background:', e);
                        }
                    } else {
                        console.warn('No valid metadata found in object:', metadata);
                    }
                },
                onPlay: () => {
                    console.log('Stream playing event triggered');
                    this._playing = true;
                    this._triggerEvent('playing');
                },
                onStreamStart: () => {
                    console.log('Stream started');
                },
                onError: (error) => {
                    console.error('Stream error:', error);
                    this._triggerEvent('error', error);
                }
            });

            // Start playing
            console.log('Calling player.play()');
            await this._player.play();
        } catch (error) {
            console.error('Error initializing Icecast player:', error);
            this._triggerEvent('error', error);
            this._playing = false;
            this._player = null;
        }
    }

    /**
     * Stop playing.
     */
    async stop() {
        console.log('Stop requested');
        
        this._playing = false;
        
        if (this._player) {
            try {
                console.log('Stopping player...');
                await this._player.stop();
            } catch (error) {
                console.error('Error stopping player:', error);
            } finally {
                this._player = null;
                this._currentMetadata = {};
                
                // Create a fresh audio element
                this._createNewAudio();
                
                this._triggerEvent('abort');
                console.log('Player stopped');
            }
        } else {
            // Still trigger abort event even if no player
            this._triggerEvent('abort');
        }
        
        return true;
    }

    /**
     * Set player volume.
     * @param {number} volume Volume value from 0 to 100.
     */
    setVolume(volume) {
        this._volume = volume;
        if (this._audio) {
            this._audio.volume = Number((volume / 100).toFixed(8));
        }
    }

    /**
     * Get player volume.
     * @return {number}
     */
    getVolume() {
        return this._volume;
    }

    /**
     * Is playing now?
     * @return {boolean}
     */
    isPlaying() {
        return this._playing;
    }

    /**
     * Get current metadata
     * @return {object}
     */
    getMetadata() {
        console.log('getMetadata called, current metadata object:', this._currentMetadata);
        if (this._currentMetadata && this._currentMetadata.StreamTitle) {
            console.log('Returning song title:', this._currentMetadata.StreamTitle);
        } else {
            console.warn('No song title available in current metadata');
        }
        return this._currentMetadata || {};
    }
    
    /**
     * Create a new audio analyzer for visualization
     * @private
     */
    _getAudioAnalyser() {
        try {
            // Create new audio context
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = context.createAnalyser();
            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 128;
            
            // Connect to the audio element
            const source = context.createMediaElementSource(this._audio);
            source.connect(analyser);
            analyser.connect(context.destination);
            
            return analyser;
        } catch (e) {
            console.error('Error creating audio analyser:', e);
            return null;
        }
    }

    /**
     * Get audio data for equalizer.
     * @return {Uint8Array}
     */
    getAudioData() {
        // Only create analyzer if needed and we're actually playing something
        if (!this._audioAnalyser && this._audio && this._playing) {
            try {
                this._audioAnalyser = this._getAudioAnalyser();
                console.log('Created new audio analyzer');
            } catch (e) {
                console.error('Error creating audio analyser:', e);
                return new Uint8Array(64).fill(0);
            }
        }

        if (this._audioAnalyser && this._playing) {
            try {
                const freqByteData = new Uint8Array(this._audioAnalyser.frequencyBinCount);
                this._audioAnalyser.getByteFrequencyData(freqByteData);
                return freqByteData;
            } catch (e) {
                console.error('Error getting frequency data:', e);
                return new Uint8Array(64).fill(0);
            }
        }
        
        // Return empty data if no analyzer or not playing
        return new Uint8Array(64).fill(0);
    }
} 