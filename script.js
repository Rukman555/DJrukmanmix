// Professional DJ Player Implementation with Tailwind CSS
class DJSoundEngine {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.audioContext.destination);
        
        this.decks = {
            a: this.createDeck('a'),
            b: this.createDeck('b')
        };
        
        this.crossfader = { position: 0.5 };
        this.masterBPM = 0;
        this.beatCounter = 0;
        this.isPlaying = false;
        this.effects = {};
        this.library = [];
        this.init();
    }
    
    createDeck(id) {
        return {
            id: id,
            audioBuffer: null,
            source: null,
            analyser: this.audioContext.createAnalyser(),
            gainNode: this.audioContext.createGain(),
            panner: this.audioContext.createStereoPanner(),
            eq: {
                low: this.createBiquadFilter('lowshelf', 250),
                mid: this.createBiquadFilter('peaking', 1000),
                high: this.createBiquadFilter('highshelf', 4000)
            },
            filter: this.createBiquadFilter('lowpass', 1000),
            pitch: 1.0,
            volume: 0.8,
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            bpm: 0,
            key: '',
            cuePoints: Array(8).fill(null),
            loop: { isActive: false, start: 0, end: 0, size: 0 },
            wavesurfer: null,
            tuna: new Tuna(this.audioContext)
        };
    }
    
    createBiquadFilter(type, frequency) {
        const filter = this.audioContext.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        return filter;
    }
    
    init() {
        // Initialize Wavesurfer for both decks
        this.initWaveSurfer('a');
        this.initWaveSurfer('b');
        
        // Set up audio routing
        this.setupAudioRouting();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Start the update loop
        this.updateInterval = setInterval(() => this.update(), 16);
        
        // Start the beat counter
        this.beatInterval = setInterval(() => this.updateBeat(), 500);
        
        // Initialize knobs
        this.initKnobs();
    }
    
    initWaveSurfer(deckId) {
        const deck = this.decks[deckId];
        const waveColor = deckId === 'a' ? 'rgba(76, 175, 80, 0.5)' : 'rgba(33, 150, 243, 0.5)';
        const progressColor = deckId === 'a' ? 'rgba(76, 175, 80, 0.8)' : 'rgba(33, 150, 243, 0.8)';
        
        deck.wavesurfer = WaveSurfer.create({
            container: `#waveform-${deckId}`,
            waveColor: waveColor,
            progressColor: progressColor,
            cursorColor: 'rgba(255, 255, 255, 0.2)',
            cursorWidth: 2,
            barWidth: 2,
            barRadius: 3,
            barGap: 2,
            height: 120,
            responsive: true,
            interact: false,
            backend: 'WebAudio',
            audioContext: this.audioContext,
            audioScriptProcessor: false
        });
        
        deck.wavesurfer.on('ready', () => {
            deck.duration = deck.wavesurfer.getDuration();
            this.updateTrackInfo(deckId);
            this.analyzeTrack(deckId);
            this.createBeatMarkers(deckId);
        });
        
        deck.wavesurfer.on('audioprocess', () => {
            deck.currentTime = deck.wavesurfer.getCurrentTime();
            this.updateTrackInfo(deckId);
            
            if (deck.loop.isActive && deck.currentTime >= deck.loop.end) {
                deck.wavesurfer.setCurrentTime(deck.loop.start);
            }
        });
        
        deck.wavesurfer.on('finish', () => {
            deck.isPlaying = false;
            this.updateTransportButtons(deckId);
        });
        
        deck.wavesurfer.on('seek', () => {
            deck.currentTime = deck.wavesurfer.getCurrentTime();
            this.updateTrackInfo(deckId);
        });
        
        // Position slider event
        document.getElementById(`position-${deckId}`).addEventListener('input', (e) => {
            const position = parseFloat(e.target.value) / 1000;
            deck.wavesurfer.seekTo(position);
        });
    }
    
    setupAudioRouting() {
        for (const deckId in this.decks) {
            const deck = this.decks[deckId];
            
            if (deck.wavesurfer && deck.wavesurfer.backend) {
                const wavesurferSource = deck.wavesurfer.backend.getAudioNode();
                wavesurferSource.disconnect();
                
                wavesurferSource.connect(deck.eq.low);
                deck.eq.low.connect(deck.eq.mid);
                deck.eq.mid.connect(deck.eq.high);
                deck.eq.high.connect(deck.filter);
                deck.filter.connect(deck.gainNode);
                deck.gainNode.connect(deck.panner);
                deck.panner.connect(this.masterGain);
                
                wavesurferSource.connect(deck.analyser);
            }
        }
    }
    
    setupEventListeners() {
        // File inputs
        document.getElementById('file-a').addEventListener('change', (e) => this.handleFileSelect(e, 'a'));
        document.getElementById('file-b').addEventListener('change', (e) => this.handleFileSelect(e, 'b'));
        
        // Crossfader
        document.getElementById('crossfader').addEventListener('input', (e) => {
            this.crossfader.position = parseFloat(e.target.value) / 100;
            this.updateCrossfader();
        });
        
        // Volume controls
        this.setupVolumeControl('a');
        this.setupVolumeControl('b');
        this.setupVolumeControl('master');
        
        // Headphone cue
        document.getElementById('headphone-cue-a').addEventListener('click', () => this.toggleHeadphoneCue('a'));
        document.getElementById('headphone-cue-b').addEventListener('click', () => this.toggleHeadphoneCue('b'));
    }
    
    initKnobs() {
        // EQ knobs
        for (const deckId in this.decks) {
            ['low', 'mid', 'high'].forEach(band => {
                this.setupKnobControl(`eq-${band}-${deckId}`, (value) => {
                    this.adjustEQ(deckId, band, value);
                });
            });
            
            // Filter knobs
            this.setupKnobControl(`filter-${deckId}`, (value) => {
                this.adjustFilter(deckId, value);
            });
        }
        
        // Effect knobs
        document.querySelectorAll('.effect-knob').forEach(knob => {
            this.setupKnobControl(knob, (value) => {
                // Effect parameter adjustment would go here
            });
        });
    }
    
    setupKnobControl(knobId, callback) {
        const knob = typeof knobId === 'string' ? document.getElementById(knobId) : knobId;
        const handle = knob.querySelector('.knob-handle, .eq-knob-handle');
        const valueDisplay = knob.querySelector('.eq-value, .knob-label');
        let isDragging = false;
        let startAngle = 0;
        let startValue = 0;
        
        knob.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = knob.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            
            if (valueDisplay) {
                const currentValueText = valueDisplay.textContent;
                if (currentValueText.includes('dB')) {
                    startValue = parseFloat(currentValueText);
                } else if (currentValueText.includes('%')) {
                    startValue = parseFloat(currentValueText);
                }
            }
            
            e.preventDefault();
        });
        
        const moveHandler = (e) => {
            if (!isDragging) return;
            
            const rect = knob.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            
            let angleDiff = currentAngle - startAngle;
            if (angleDiff > 180) angleDiff -= 360;
            if (angleDiff < -180) angleDiff += 360;
            
            const sensitivity = 0.5;
            const newValue = startValue + (angleDiff / sensitivity);
            
            callback(newValue);
        };
        
        const upHandler = () => {
            isDragging = false;
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }
    
    setupVolumeControl(deckId) {
        const slider = document.getElementById(deckId === 'master' ? 'master-volume-control' : `volume-${deckId}`);
        const handle = slider.querySelector('.volume-handle');
        let isDragging = false;
        
        slider.addEventListener('mousedown', (e) => {
            isDragging = true;
            this.updateVolumeFromPosition(deckId, e, slider, handle);
            e.preventDefault();
        });
        
        const moveHandler = (e) => {
            if (!isDragging) return;
            this.updateVolumeFromPosition(deckId, e, slider, handle);
        };
        
        const upHandler = () => {
            isDragging = false;
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }
    
    updateVolumeFromPosition(deckId, e, slider, handle) {
        const rect = slider.getBoundingClientRect();
        let y = e.clientY - rect.top;
        y = Math.max(0, Math.min(rect.height, y));
        
        const percent = 100 - (y / rect.height) * 100;
        handle.style.bottom = `${percent}%`;
        
        if (deckId === 'master') {
            this.adjustMasterVolume(percent);
        } else {
            this.adjustVolume(deckId, percent);
        }
    }
    
    handleFileSelect(event, deckId) {
        const file = event.target.files[0];
        if (!file) return;
        
        const url = URL.createObjectURL(file);
        this.decks[deckId].wavesurfer.load(url);
        document.querySelector(`#deck-${deckId} .track-name span`).textContent = file.name;
        this.addToLibrary(file.name, url, deckId);
    }
    
    analyzeTrack(deckId) {
        const deck = this.decks[deckId];
        const randomBPM = 120 + Math.floor(Math.random() * 30) - 15;
        deck.bpm = randomBPM;
        document.querySelector(`#deck-${deckId} .deck-bpm`).textContent = randomBPM.toFixed(1);
        this.updateMasterBPM();
        
        const musicalKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const randomKey = musicalKeys[Math.floor(Math.random() * musicalKeys.length)] + 'm';
        deck.key = randomKey;
        document.querySelector(`#deck-${deckId} .deck-key`).textContent = randomKey;
    }
    
    createBeatMarkers(deckId) {
        const deck = this.decks[deckId];
        const container = document.getElementById(`beat-markers-${deckId}`);
        container.innerHTML = '';
        
        if (!deck.bpm || deck.bpm <= 0) return;
        
        const beatsPerSecond = deck.bpm / 60;
        const totalBeats = Math.floor(deck.duration * beatsPerSecond);
        const beatInterval = 1 / beatsPerSecond;
        
        for (let i = 0; i < totalBeats; i++) {
            const beatPosition = (i * beatInterval) / deck.duration * 100;
            const marker = document.createElement('div');
            marker.className = 'beat-marker bg-gray-700';
            marker.style.left = `${beatPosition}%`;
            
            if (i % 4 === 0) {
                marker.classList.add('bg-gray-600');
            }
            
            container.appendChild(marker);
        }
    }
    
    addToLibrary(name, url, deckId) {
        const deck = this.decks[deckId];
        const libraryItem = {
            name: name,
            url: url,
            bpm: deck.bpm,
            key: deck.key,
            duration: deck.duration
        };
        
        this.library.push(libraryItem);
        this.updateLibraryDisplay();
    }
    
    updateLibraryDisplay() {
        const libraryContainer = document.getElementById('library-items');
        libraryContainer.innerHTML = '';
        
        this.library.forEach((track) => {
            const trackElement = document.createElement('div');
            trackElement.className = 'grid grid-cols-12 px-4 py-3 text-sm border-b border-gray-700 hover:bg-gray-700 cursor-pointer';
            trackElement.innerHTML = `
                <div class="col-span-5 truncate">${track.name}</div>
                <div class="col-span-4 truncate">Artist</div>
                <div class="col-span-1 text-center text-orange-400 font-orbitron">${track.bpm ? track.bpm.toFixed(1) : '--'}</div>
                <div class="col-span-1 text-center text-purple-400 font-orbitron">${track.key || '--'}</div>
                <div class="col-span-1 text-center text-gray-400 font-orbitron">${this.formatTime(track.duration)}</div>
            `;
            
            trackElement.addEventListener('click', () => {
                this.loadTrackToDeck('a', track.url, track.name);
                this.loadTrackToDeck('b', track.url, track.name);
            });
            
            libraryContainer.appendChild(trackElement);
        });
    }
    
    loadTrackToDeck(deckId, url, name) {
        this.decks[deckId].wavesurfer.load(url);
        document.querySelector(`#deck-${deckId} .track-name span`).textContent = name;
    }
    
    togglePlay(deckId) {
        const deck = this.decks[deckId];
        
        if (deck.wavesurfer.isPlaying()) {
            deck.wavesurfer.pause();
            deck.isPlaying = false;
        } else {
            deck.wavesurfer.play();
            deck.isPlaying = true;
        }
        
        this.updateTransportButtons(deckId);
    }
    
    stopTrack(deckId) {
        this.decks[deckId].wavesurfer.stop();
        this.decks[deckId].isPlaying = false;
        this.updateTransportButtons(deckId);
    }
    
    setCue(deckId) {
        const deck = this.decks[deckId];
        deck.cuePoints[0] = deck.wavesurfer.getCurrentTime();
        deck.wavesurfer.play(deck.cuePoints[0]);
        deck.isPlaying = true;
        this.updateTransportButtons(deckId);
    }
    
    setHotCue(deckId, cueNumber) {
        const deck = this.decks[deckId];
        const cueIndex = cueNumber - 1;
        const cueButton = document.querySelector(`#deck-${deckId} .hot-cue-btn[data-cue="${cueNumber}"]`);
        
        if (deck.isPlaying && !deck.cuePoints[cueIndex]) {
            // Set cue point
            deck.cuePoints[cueIndex] = deck.wavesurfer.getCurrentTime();
            
            // Highlight button
            cueButton.classList.add('bg-orange-400', 'text-black');
            cueButton.textContent = `C${cueNumber}`;
        } else if (deck.cuePoints[cueIndex]) {
            // Jump to cue point
            deck.wavesurfer.setCurrentTime(deck.cuePoints[cueIndex]);
            if (!deck.isPlaying) {
                deck.wavesurfer.play();
                deck.isPlaying = true;
            }
        }
    }
    
    syncBPM(deckId) {
        const targetDeck = deckId === 'a' ? 'b' : 'a';
        const targetDeckObj = this.decks[targetDeck];
        const currentDeckObj = this.decks[deckId];
        
        if (targetDeckObj.isPlaying && targetDeckObj.bpm > 0) {
            const pitchRatio = targetDeckObj.bpm / currentDeckObj.bpm;
            const pitchPercent = (pitchRatio - 1) * 100;
            
            this.adjustPitch(deckId, pitchPercent);
            document.getElementById(`pitch-${deckId}`).value = pitchPercent;
            document.getElementById(`pitch-value-${deckId}`).textContent = `${pitchPercent > 0 ? '+' : ''}${pitchPercent.toFixed(1)}%`;
        }
    }
    
    nudge(deckId, amount) {
        const deck = this.decks[deckId];
        if (!deck.isPlaying) return;
        
        const currentRate = deck.wavesurfer.getPlaybackRate();
        deck.wavesurfer.setPlaybackRate(currentRate + amount);
        
        setTimeout(() => {
            deck.wavesurfer.setPlaybackRate(currentRate);
        }, 200);
    }
    
    toggleLoop(deckId) {
        const deck = this.decks[deckId];
        deck.loop.isActive = !deck.loop.isActive;
        const loopButton = document.getElementById(`loop-${deckId}`);
        
        if (deck.loop.isActive) {
            const loopSizeInSeconds = this.getLoopSizeInSeconds(deck.loop.size);
            deck.loop.start = deck.currentTime;
            deck.loop.end = deck.currentTime + loopSizeInSeconds;
            
            loopButton.classList.remove('border-green-500', 'text-green-500');
            loopButton.classList.add('bg-green-500', 'text-white');
        } else {
            loopButton.classList.add('border-green-500', 'text-green-500');
            loopButton.classList.remove('bg-green-500', 'text-white');
        }
    }
    
    adjustLoopSize(deckId, factor) {
        const deck = this.decks[deckId];
        const loopSizes = [0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32];
        let currentIndex = loopSizes.indexOf(deck.loop.size);
        
        if (factor > 1) {
            currentIndex = Math.min(currentIndex + 1, loopSizes.length - 1);
        } else {
            currentIndex = Math.max(currentIndex - 1, 0);
        }
        
        deck.loop.size = loopSizes[currentIndex];
        document.getElementById(`loop-size-${deckId}`).textContent = `1/${32 / Math.pow(2, currentIndex)}`;
        
        if (deck.loop.isActive) {
            const loopSizeInSeconds = this.getLoopSizeInSeconds(deck.loop.size);
            deck.loop.start = deck.currentTime;
            deck.loop.end = deck.currentTime + loopSizeInSeconds;
        }
    }
    
    getLoopSizeInSeconds(loopSize) {
        const deck = this.getPlayingDeck();
        if (!deck || deck.bpm <= 0) return 1;
        return loopSize / (deck.bpm / 60);
    }
    
    adjustPitch(deckId, percent) {
        const deck = this.decks[deckId];
        deck.pitch = 1 + (percent / 100);
        deck.wavesurfer.setPlaybackRate(deck.pitch);
        
        if (deck.bpm) {
            const adjustedBPM = deck.bpm * deck.pitch;
            document.querySelector(`#deck-${deckId} .deck-bpm`).textContent = adjustedBPM.toFixed(1);
            this.updateMasterBPM();
        }
    }
    
    adjustEQ(deckId, band, value) {
        const deck = this.decks[deckId];
        value = Math.max(-12, Math.min(12, parseFloat(value)));
        
        switch (band) {
            case 'low': deck.eq.low.gain.value = value; break;
            case 'mid': deck.eq.mid.gain.value = value; break;
            case 'high': deck.eq.high.gain.value = value; break;
        }
        
        const eqValueElement = document.querySelector(`#eq-${band}-${deckId} .eq-value`);
        if (eqValueElement) {
            eqValueElement.textContent = `${value > 0 ? '+' : ''}${value.toFixed(1)}dB`;
        }
    }
    
    adjustFilter(deckId, value) {
        const deck = this.decks[deckId];
        const minFreq = 20;
        const maxFreq = 20000;
        const freq = minFreq * Math.pow(maxFreq / minFreq, (value + 50) / 100);
        
        deck.filter.frequency.value = freq;
        const filterValueElement = document.querySelector(`#filter-${deckId} .eq-value`);
        
        if (filterValueElement) {
            if (value < 10) {
                filterValueElement.textContent = 'OFF';
                deck.filter.frequency.value = maxFreq;
            } else if (value < 55) {
                filterValueElement.textContent = 'LOW';
                deck.filter.type = 'lowpass';
            } else {
                filterValueElement.textContent = 'HIGH';
                deck.filter.type = 'highpass';
            }
        }
    }
    
    adjustVolume(deckId, value) {
        const deck = this.decks[deckId];
        deck.volume = value / 100;
        deck.gainNode.gain.value = deck.volume;
        this.updateCrossfader();
        this.updateVolumeMeter(deckId);
    }
    
    adjustMasterVolume(value) {
        this.masterGain.gain.value = value / 100;
        this.updateVolumeMeter('master');
    }
    
    updateCrossfader() {
        const deckA = this.decks['a'];
        const deckB = this.decks['b'];
        
        let deckAVolume, deckBVolume;
        
        if (this.crossfader.position <= 0.5) {
            deckAVolume = 1.0;
            deckBVolume = this.crossfader.position * 2;
        } else {
            deckAVolume = (1 - this.crossfader.position) * 2;
            deckBVolume = 1.0;
        }
        
        deckA.gainNode.gain.value = deckA.volume * deckAVolume;
        deckB.gainNode.gain.value = deckB.volume * deckBVolume;
    }
    
    toggleHeadphoneCue(deckId) {
        const button = document.getElementById(`headphone-cue-${deckId}`);
        button.classList.toggle('bg-blue-500');
        button.classList.toggle('text-white');
    }
    
    updateTransportButtons(deckId) {
        const playButton = document.getElementById(`play-${deckId}`);
        
        if (this.decks[deckId].isPlaying) {
            playButton.innerHTML = '<i class="fas fa-pause"></i>';
            playButton.classList.remove('bg-green-500');
            playButton.classList.add('bg-red-500');
        } else {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.classList.remove('bg-red-500');
            playButton.classList.add('bg-green-500');
        }
    }
    
    updateTrackInfo(deckId) {
        const deck = this.decks[deckId];
        const currentTime = this.formatTime(deck.currentTime, true);
        const duration = this.formatTime(deck.duration, true);
        
        document.getElementById(`current-time-${deckId}`).textContent = currentTime;
        document.getElementById(`duration-${deckId}`).textContent = duration;
        
        const positionSlider = document.getElementById(`position-${deckId}`);
        if (document.activeElement !== positionSlider) {
            positionSlider.value = (deck.currentTime / deck.duration) * 1000;
            document.getElementById(`progress-${deckId}`).style.width = `${(deck.currentTime / deck.duration) * 100}%`;
        }
    }
    
    updateMasterBPM() {
        const playingDecks = Object.values(this.decks).filter(deck => deck.isPlaying && deck.bpm > 0);
        
        if (playingDecks.length === 0) {
            this.masterBPM = 0;
        } else if (playingDecks.length === 1) {
            this.masterBPM = playingDecks[0].bpm;
        } else {
            this.masterBPM = playingDecks.reduce((sum, deck) => sum + deck.bpm, 0) / playingDecks.length;
        }
        
        document.getElementById('master-bpm').textContent = this.masterBPM.toFixed(1);
    }
    
    updateBeat() {
        if (this.masterBPM <= 0) return;
        
        const beatInterval = 60000 / this.masterBPM;
        const now = Date.now();
        const beatPosition = Math.floor((now % (beatInterval * 4)) / beatInterval);
        
        for (let i = 1; i <= 4; i++) {
            const beatDot = document.getElementById(`beat-${i}`);
            if (i === beatPosition + 1) {
                beatDot.classList.add('bg-orange-400');
            } else {
                beatDot.classList.remove('bg-orange-400');
            }
        }
    }
    
    updateVolumeMeter(deckId) {
        const deck = deckId === 'master' ? null : this.decks[deckId];
        const meterElement = document.getElementById(deckId === 'master' ? 'master-volume-level' : `volume-level-${deckId}`);
        
        if (!meterElement) return;
        
        let level;
        
        if (deckId === 'master') {
            const aLevel = this.decks.a.isPlaying ? Math.random() * this.decks.a.volume : 0;
            const bLevel = this.decks.b.isPlaying ? Math.random() * this.decks.b.volume : 0;
            level = (aLevel + bLevel) * this.masterGain.gain.value;
        } else {
            level = deck.isPlaying ? Math.random() * deck.volume : 0;
        }
        
        let dB = 20 * Math.log10(level || 0.0001);
        dB = Math.max(-60, dB);
        
        const meterHeight = ((dB + 60) / 60) * 100;
        meterElement.style.height = `${meterHeight}%`;
        
        if (meterHeight > 85) {
            meterElement.className = 'volume-level absolute bottom-0 left-0 right-0 bg-gradient-to-t from-red-500 to-orange-400';
        } else if (meterHeight > 60) {
            meterElement.className = 'volume-level absolute bottom-0 left-0 right-0 bg-gradient-to-t from-orange-400 to-yellow-400';
        } else {
            meterElement.className = 'volume-level absolute bottom-0 left-0 right-0 bg-gradient-to-t from-green-500 to-green-400';
        }
    }
    
    formatTime(seconds, includeHours = false) {
        if (isNaN(seconds)) return includeHours ? '00:00:00' : '00:00';
        
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (includeHours || hrs > 0) {
            return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }
    
    update() {
        this.updateMasterClock();
        this.updateVolumeMeter('a');
        this.updateVolumeMeter('b');
        this.updateVolumeMeter('master');
    }
    
    updateMasterClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {hour12: false});
        document.getElementById('master-clock').textContent = timeString;
    }
    
    getPlayingDeck() {
        return Object.values(this.decks).find(deck => deck.isPlaying) || null;
    }
}

// Initialize the DJ engine when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.djEngine = new DJSoundEngine();
});