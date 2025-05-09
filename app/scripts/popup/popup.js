import {translate, translateAll} from '../common/Translator.js';
import {sendMessageToBackground, sendMessageToOffscreen} from "../common/Utils.js";

/**
 * Stations container.
 * @type {HTMLElement}
 * @private
 */
const $stations = document.getElementById('stations');

/**
 * Favorites container.
 * @type {HTMLElement}
 * @private
 */
const $favorites = document.getElementById('favorites');

/**
 * Player container
 * @type {HTMLElement}
 * @private
 */
const $player = document.getElementById('player');

const $footer = document.getElementById('footer');

const $search = document.getElementById('search');

/**
 * Metadata update interval
 * @type {number|null}
 * @private
 */
let _metadataInterval = null;

/**
 * Renders adding station to favorites.
 * @param {string} name
 * @private
 */
function renderLike(name) {
    const $station = $stations.querySelector('.station[data-name="' + name + '"]');
    const height = $station.offsetHeight;
    const top = $station.offsetTop;

    $station.classList.add('favorite');
    $station.classList.add('move');

    $station.addEventListener('transitionend', function trEnd(e) {
        if (e.propertyName !== 'transform') {
            return;
        }
        $station.removeEventListener('transitionend', trEnd);

        $favorites.classList.remove('move');
        $favorites.style.paddingTop = 0;
        $favorites.prepend($station);
        $station.style.transform = 'none';
        $station.style.marginBottom = 0;
        $station.classList.remove('move');
    });

    $stations.scrollTop = 0;
    $favorites.classList.add('move');
    $favorites.style.paddingTop = `${height}px`;
    $station.style.transform = `translateY(-${top + height}px)`;
    $station.style.marginBottom = `-${height}px`;

    if ($player.dataset.name === name) {
        $player.classList.add('favorite');
    }
}

/**
 * Renders removing station from favorites.
 * @param {string} name
 * @private
 */
function renderDislike(name) {
    const $station = document.querySelector('.station[data-name="' + name + '"]');
    const height = $station.offsetHeight;
    const top = $station.offsetTop;
    const newTop = $favorites.offsetHeight - height - top;

    $station.classList.remove('favorite');
    $station.classList.add('move');

    $station.addEventListener('transitionend', function trEnd(e) {
        if (e.propertyName !== 'transform') {
            return;
        }
        $station.removeEventListener('transitionend', trEnd);

        $favorites.classList.remove('move');
        $favorites.style.paddingBottom = 0;
        $favorites.after($station);
        $station.style.transform = 'none';
        $station.style.marginBottom = 0;
        $station.classList.remove('move');
    });

    $station.style.transform = `translateY(${newTop}px)`;
    $station.style.marginBottom = `-${height}px`;

    $favorites.classList.add('move');
    $favorites.style.paddingBottom = `${height}px`;

    if ($player.dataset.name === name) {
        $player.classList.remove('favorite');
    }
}

/**
 * Renders one station for stations list.
 * @param {string} name
 * @param {string} title
 * @param {string} image
 * @param {boolean} favorite
 * @return {HTMLElement}
 * @private
 */
function renderStation(name, title, image, favorite) {
    const $station = document.createElement('div');
    $station.className = 'station';
    $station.dataset.name = name;
    if (favorite) {
        $station.classList.add('favorite');
    }

    const $image = document.createElement('div');
    $image.className = 'image';
    $station.appendChild($image);

    const $play = document.createElement('i');
    $play.className = 'icon icon-play';
    $play.title = translate('play');
    $station.appendChild($play);

    const $stop = document.createElement('i');
    $stop.className = 'icon icon-stop';
    $stop.title = translate('stop');
    $station.appendChild($stop);

    const $like = document.createElement('i');
    $like.className = 'icon icon-like';
    $like.title = translate('like');
    $station.appendChild($like);

    const $dislike = document.createElement('i');
    $dislike.className = 'icon icon-dislike';
    $dislike.title = translate('dislike');
    $station.appendChild($dislike);

    const $title = document.createElement('h3');
    $title.className = 'title';
    $title.textContent = title;
    $station.appendChild($title);

    setTimeout(() => {
        $image.style.backgroundImage = image ? 'url(' + image + ')' : '';
    }, 50);

    return $station;
}

/**
 * Renders visualization.
 * @private
 */
function renderEqualizer() {
    const $container = $player.querySelector('.equalizer');

    const BAR_WIDTH = 3; // Ширина полоски
    const SPACER_WIDTH = 1; // Ширина отступа
    const EMPTY_HEIGHT = 1; // Высота "пустого" бара
    const CANVAS_WIDTH = $container.offsetWidth
    const CANVAS_HEIGHT = $container.offsetHeight;
    const NUM_BARS = Math.round(CANVAS_WIDTH / (SPACER_WIDTH + BAR_WIDTH));

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    $container.appendChild(canvas);

    // Canvas context
    const canvasContext = canvas.getContext('2d');
    const gradient = canvasContext.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(1, '#0088cc');
    gradient.addColorStop(0.5, '#00719f');
    gradient.addColorStop(0, '#005E84');
    canvasContext.fillStyle = gradient;

    // First render
    for (let i = 0; i < NUM_BARS; ++i) {
        canvasContext.fillRect(
            i * (SPACER_WIDTH + BAR_WIDTH),
            CANVAS_HEIGHT,
            BAR_WIDTH,
            -EMPTY_HEIGHT
        );
    }

    (async function drawFrame() {
        if (!$player.classList.contains('playing')) {
            canvasContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - EMPTY_HEIGHT);
            window.requestAnimationFrame(drawFrame);
            return;
        }

        const freqByteData = await sendMessageToOffscreen('getAudioData');
        canvasContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT - EMPTY_HEIGHT);

        if (!freqByteData) {
            window.requestAnimationFrame(drawFrame);
            return;
        }

        for (let i = 0; i < NUM_BARS; ++i) {
            const magnitude = Math.ceil(freqByteData[i] * CANVAS_HEIGHT / 255); // 255 is the maximum magnitude of a value in the frequency data
            canvasContext.fillRect(
                i * (SPACER_WIDTH + BAR_WIDTH),
                CANVAS_HEIGHT,
                BAR_WIDTH,
                -magnitude
            );
        }

        window.requestAnimationFrame(drawFrame);
    })();
}

/**
 * Set volume.
 * @param {number} volume
 * @param {boolean=} setInputValue
 * @param {boolean=} renderOnly
 * @private
 */
function setVolume(volume, setInputValue, renderOnly) {
    const $mute = $player.querySelector('.icon-mute');
    const $unmute = $player.querySelector('.icon-unmute');
    $mute.style.display = 'block';
    $unmute.style.display = 'none';

    // Clamp volume to 0-100 for the slider
    volume = Math.max(0, Math.min(volume, 100));

    if (volume === 0) {
        $mute.style.display = 'none';
        $unmute.style.display = 'block';
    }
    if (setInputValue) {
        $player.querySelector('.volume > input').value = volume * 15;
    }
    if (!renderOnly) {
        // Scale to 0-20 for the backend
        sendMessageToOffscreen('volume', String(volume / 15));
    }
}

/**
 * Renders stations list.
 * @private
 */
async function renderStationsList() {
    try {
        const [stations, favorites] = await Promise.all([
            sendMessageToBackground('getStations').catch(error => {
                console.error('Error getting stations:', error);
                return {};
            }),
            sendMessageToBackground('getFavorites').catch(error => {
                console.error('Error getting favorites:', error);
                return [];
            })
        ]);

        if (!stations || Object.keys(stations).length === 0) {
            console.warn('No stations received or empty stations object');
            return;
        }

        // Clear existing stations if re-rendering
        if ($favorites.children.length > 0) {
            $favorites.innerHTML = '';
        }
        if ($stations.children.length > 0) {
            $stations.innerHTML = '';
        }

        // Render favorites first
        for (let i = 0, l = favorites.length; i < l; i++) {
            const name = favorites[i];
            if (stations.hasOwnProperty(name) && !stations[name].isHidden) {
                $favorites.prepend(renderStation(name, stations[name].title, stations[name].image, true));
            }
        }

        // Render other stations
        for (let n in stations) {
            if (stations.hasOwnProperty(n) && favorites.indexOf(n) < 0 && !stations[n].isHidden) {
                $stations.append(renderStation(stations[n].name, stations[n].title, stations[n].image, false));
            }
        }

        // Initialize event handlers for the new station elements
        initEvents();
    } catch (error) {
        console.error('Error rendering stations list:', error);
    }
}

/**
 * Init events.
 */
function initEvents() {
    $stations.querySelectorAll('.station').forEach(($station) => {
        $station.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessageToOffscreen('play', $station.dataset.name);
        });

        $station.querySelector('.icon-like').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sendMessageToBackground('like', $station.dataset.name);
            renderLike($station.dataset.name);
        });

        $station.querySelector('.icon-dislike').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sendMessageToBackground('dislike', $station.dataset.name);
            renderDislike($station.dataset.name);
        });
    });

    $player.querySelector('.title').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target.classList.contains('link')) {
            sendMessageToBackground('link', $player.dataset.name);
        }
    });

    $player.querySelector('.icon-like').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        sendMessageToBackground('like', $player.dataset.name);
        renderLike($player.dataset.name);
    });

    $player.querySelector('.icon-dislike').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        sendMessageToBackground('dislike', $player.dataset.name);
        renderDislike($player.dataset.name);
    });

    $player.querySelector('.volume > input').addEventListener('input', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setVolume(Number(e.target.value));
    });

    $player.querySelector('.icon-mute').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setVolume(0, true);
    });

    $player.querySelector('.icon-unmute').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setVolume(await sendMessageToBackground('getVolumeLast'), true);
    });

    $player.addEventListener('mousewheel', async (e) => {
        e.preventDefault();
        // Get current volume (0-20), scale to 0-100
        const backendVolume = await sendMessageToBackground('getVolume');
        const volume = backendVolume * 15;
        const step = 1;
        const delta = e.wheelDelta;

        if (delta > 0 && volume < 100) {
          setVolume(volume + step, true);
        }
        else if (delta < 0 && volume > 0) {
          setVolume(volume - step, true);
        }
    });

    $player.querySelector('.icon-play-big').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        sendMessageToOffscreen('play', $player.dataset.name);
    });

    $player.querySelector('.icon-stop-big').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        sendMessageToOffscreen('play', $player.dataset.name);
    });

    $footer.querySelector('.icon-options').addEventListener('click', (e) => {
        e.preventDefault();
        sendMessageToBackground('options');
    });

    $footer.querySelector('.icon-add').addEventListener('click', (e) => {
        e.preventDefault();
        sendMessageToBackground('options', 'add');
    });

    $footer.querySelector('.icon-feedback').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({url: 'https://github.com/Anonym-tsk/chrome-online-radio/issues'});
    });

    const $searchBox = $search.querySelector('.search');
    const searchHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const value = $searchBox.value.toLowerCase();

        $stations.querySelectorAll('.station').forEach(($station) => {
            const match = $station.querySelector('.title').textContent.toLowerCase().indexOf(value) >= 0;
            $station.style.display = match ? 'block' : 'none';
        });
    };
    $searchBox.addEventListener('keyup', searchHandler);
    $searchBox.addEventListener('paste', searchHandler);
    $searchBox.addEventListener('search', searchHandler);
    $searchBox.addEventListener('blur', searchHandler);
}

/**
 * Updates the now playing display with current metadata
 */
async function updateNowPlaying() {
    const $nowPlayingContainer = document.querySelector('#now-playing');
    const $nowPlayingContent = document.querySelector('.now-playing-content');
    const $nowPlayingText = document.querySelector('.now-playing-text');
    
    if (!$player.classList.contains('playing')) {
        console.log('Player not playing, hiding now playing display');
        $nowPlayingContainer.style.display = 'none';
        return;
    }
    
    console.log('Player is playing, showing now playing display');
    $nowPlayingContainer.style.display = 'block';
    
    try {
        console.log('Requesting metadata from offscreen page...');
        const metadata = await sendMessageToOffscreen('getMetadata').catch(error => {
            console.error('Error getting metadata:', error);
            return null;
        });
        
        if (!metadata) {
            console.warn('Failed to get metadata, showing default "Now Playing" text');
            $nowPlayingText.textContent = translate('now_playing');
            $nowPlayingContent.classList.remove('scrolling');
            return;
        }
        
        console.log('Received raw metadata for now playing display:', metadata);
        
        if (metadata && metadata.StreamTitle && metadata.StreamTitle.trim() !== '') {
            const songTitle = metadata.StreamTitle.trim();
            console.log('Valid metadata found, setting now playing text to:', songTitle);
            $nowPlayingText.textContent = songTitle;
            
            // Check if text needs scrolling (is wider than container)
            setTimeout(() => {
                const containerWidth = $nowPlayingContainer.offsetWidth;
                const textWidth = $nowPlayingText.offsetWidth + 40; // Add some padding
                
                console.log('Now playing text dimensions - Container width:', containerWidth, 'Text width:', textWidth);
                if (textWidth > containerWidth) {
                    console.log('Text is wider than container, enabling scrolling');
                    $nowPlayingContent.classList.add('scrolling');
                } else {
                    console.log('Text fits in container, disabling scrolling');
                    $nowPlayingContent.classList.remove('scrolling');
                }
            }, 100); // Small delay to ensure text is rendered
        } else {
            console.log('No valid metadata found, showing default "Now Playing" text');
            $nowPlayingText.textContent = translate('now_playing');
            $nowPlayingContent.classList.remove('scrolling');
        }
    } catch (error) {
        console.error('Error updating now playing:', error);
        $nowPlayingText.textContent = translate('now_playing');
        $nowPlayingContent.classList.remove('scrolling');
    }
}

/**
 * Updates the player's metadata display
 */
async function updateMetadata() {
    if (!$player.classList.contains('playing')) {
        console.log('Player not playing, skipping metadata update');
        return;
    }

    console.log('Updating player metadata display...');
    try {
        const metadata = await sendMessageToOffscreen('getMetadata').catch(error => {
            console.error('Error getting metadata:', error);
            return null;
        });
        
        if (!metadata) {
            console.warn('Failed to get metadata for player display');
            return;
        }
        
        console.log('Received metadata for player display:', metadata);
        
        if (metadata && metadata.StreamTitle && metadata.StreamTitle.trim() !== '') {
            console.log('Valid StreamTitle found:', metadata.StreamTitle);
            
            // Check if we already have a metadata display element
            let $metadata = $player.querySelector('.metadata');
            
            if (!$metadata) {
                console.log('Creating new metadata display element');
                $metadata = document.createElement('div');
                $metadata.className = 'metadata';
                // Insert after title
                const $title = $player.querySelector('.title');
                $title.insertAdjacentElement('afterend', $metadata);
            } else {
                console.log('Updating existing metadata display element');
            }
            
            $metadata.textContent = metadata.StreamTitle;
            console.log('Metadata element text set to:', metadata.StreamTitle);
            
            // Update the now playing display separately here
            updateNowPlaying();
        } else {
            console.warn('No valid metadata found for player display');
        }
    } catch (error) {
        console.error('Error updating metadata:', error);
    }
}

/**
 * Set player state.
 * @param {string=} state
 */
async function setPlayerState(state) {
    state = state || (await sendMessageToOffscreen('getStatus'));
    const start = async () => {
        stop();
        const station = await sendMessageToBackground('getLastStation');
        if (!station) {
            return;
        }

        const $station = document.querySelector('.station[data-name="' + station.name + '"]');
        const $description = $player.querySelector('.description');

        $station.classList.add('active');
        $description.textContent = '';

        $player.classList.add('buffering', 'ready');
        $player.classList.toggle('favorite', $station.classList.contains('favorite'));
        $player.dataset.name = station.name;

        const $title = $player.querySelector('.title');
        $title.textContent = station.title;
        $title.classList.remove('link');

        if (station.url) {
            $title.classList.add('link');
            $title.setAttribute('title', translate('link'));
        }

        setTimeout(() => {
            const $image = $player.querySelector('.image');
            $image.style.backgroundImage = station.image ? 'url(' + station.image + ')' : '';
        }, 50);

        const names = Object.keys(station.streams);
        names.forEach((name) => {
            const $button = document.createElement('button');
            $button.className = 'quality';
            $button.classList.toggle('__active', station.streamName === name);
            $button.textContent = isFinite(name) ? '♬' : name;
            $button.setAttribute('title', station.streams[name]);
            $button.dataset.name = name;
            $button.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                sendMessageToOffscreen('stream', name);
            });

            $description.appendChild($button);
        });
        
        // Initialize the now playing section to hidden
        document.querySelector('#now-playing').style.display = 'none';
    };

    const error = () => {
        stop();
        $player.classList.add('error');
    };

    const stop = () => {
        document.querySelector('.active')?.classList.remove('active');
        $player.classList.remove('buffering', 'playing', 'error');
        
        // Clear metadata display
        const $metadata = $player.querySelector('.metadata');
        if ($metadata) {
            $metadata.remove();
        }
        
        // Hide now playing
        document.querySelector('#now-playing').style.display = 'none';
        
        // Clear metadata update interval
        if (_metadataInterval) {
            clearInterval(_metadataInterval);
            _metadataInterval = null;
        }
    };

    const play = function() {
        $player.classList.remove('buffering', 'error');
        $player.classList.add('playing');
        
        // Set up metadata update interval
        updateMetadata();
        updateNowPlaying();
        
        if (!_metadataInterval) {
            _metadataInterval = setInterval(() => {
                updateMetadata();
                updateNowPlaying();
            }, 5000);
        }
    };

    if (!$player.classList.contains('ready') && state !== 'buffering') {
        await start();
    }

    switch (state) {
        case 'buffering':
            await start();
            break;
        case 'playing':
            play();
            break;
        case 'stopped':
            stop();
            break;
        case 'error':
            error();
            break;
    }
}

/**
 * Scroll popup to current station.
 */
async function scrollToLastStation() {
    const station = await sendMessageToBackground('getLastStation');
    if (!station) {
        return;
    }

    const $station = document.querySelector('.station[data-name="' + station.name + '"]');
    $stations.style.scrollBehavior = 'auto';
    $stations.scrollTop = $stations.scrollTop + $station.offsetTop - $station.offsetHeight;
    $stations.style.scrollBehavior = 'smooth';
}

// Listen messages from background
chrome.runtime.onMessage.addListener((message) => {
    if (message.target !== 'popup') {
        return;
    }
    console.log('Message to popup', message);
    setPlayerState(message.action);
});

(async () => {
    await renderStationsList();
    translateAll();
    setVolume(await sendMessageToBackground('getVolume'), true, true);
    renderEqualizer();
    await setPlayerState();
    await scrollToLastStation();
})();


