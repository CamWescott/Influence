// Background music generator — Web Audio API step-sequencer driven by a
// text prompt. A keyword/mood parser maps the prompt to a musical profile
// (genre, scale, BPM, instrument mix) and a scheduler fires kick / snare /
// hihat / bass / pad / melody nodes in real time, looping indefinitely.
//
// Public API: window.WanderlustMusic = { start(prompt) → label, stop(), setVolume(0..1), isPlaying() }
// UI wiring is done at the bottom of this file for both panels.

(function () {
  'use strict';

  // ---- Music theory ----

  // Semitone intervals from root for each scale
  const SCALES = {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    pentatonic: [0, 2, 4, 7, 9],
    blues:      [0, 3, 5, 6, 7, 10],
    lydian:     [0, 2, 4, 6, 7, 9, 11],
    phrygian:   [0, 1, 3, 5, 7, 8, 10],
  };

  // Chord progression: 4 scale-degree roots (one per bar) for pad / bass
  const PROGRESSIONS = {
    major:      [0, 4, 5, 3],  // I  – V  – vi – IV
    minor:      [0, 5, 3, 4],  // i  – VI – III – VII
    dorian:     [0, 3, 0, 4],  // i  – IV – i  – VII
    pentatonic: [0, 2, 4, 2],
    blues:      [0, 0, 3, 3],  // I  – I  – IV – IV
    lydian:     [0, 1, 4, 0],
    phrygian:   [0, 1, 0, 1],
  };

  // ---- Genre presets ----
  // kick / snare / hihat are 16-step arrays (one per 16th note in a 4/4 bar).
  // pVol=pad, bVol=bass, mVol=melody, dVol=drums — all 0..1 gain scalars.

  const G = {
    default: {
      bpm: 88, scale: 'major', root: 60,
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      bass: true, pad: true, melody: true,
      padType: 'triangle', bassType: 'sawtooth', melType: 'triangle',
      pVol: 0.09, bVol: 0.12, mVol: 0.13, dVol: 0.55,
    },
    techno: {
      bpm: 133, scale: 'minor', root: 45,
      kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [0,1,0,1, 0,1,0,1, 0,1,0,1, 0,1,0,1],
      bass: true, pad: true, melody: false,
      padType: 'sawtooth', bassType: 'sawtooth', melType: 'square',
      pVol: 0.07, bVol: 0.15, mVol: 0, dVol: 0.85,
    },
    jazz: {
      bpm: 96, scale: 'dorian', root: 55,
      kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      bass: true, pad: true, melody: true,
      padType: 'triangle', bassType: 'triangle', melType: 'sawtooth',
      pVol: 0.08, bVol: 0.10, mVol: 0.16, dVol: 0.45,
    },
    ambient: {
      bpm: 62, scale: 'major', root: 48,
      kick:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass: false, pad: true, melody: true,
      padType: 'sine', bassType: 'sine', melType: 'sine',
      pVol: 0.13, bVol: 0, mVol: 0.08, dVol: 0,
    },
    classical: {
      bpm: 76, scale: 'major', root: 60,
      kick:  [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      hihat: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
      bass: true, pad: true, melody: true,
      padType: 'triangle', bassType: 'triangle', melType: 'triangle',
      pVol: 0.08, bVol: 0.10, mVol: 0.17, dVol: 0,
    },
    folk: {
      bpm: 104, scale: 'major', root: 62,
      kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      bass: true, pad: true, melody: true,
      padType: 'triangle', bassType: 'triangle', melType: 'triangle',
      pVol: 0.08, bVol: 0.11, mVol: 0.17, dVol: 0.50,
    },
    reggae: {
      bpm: 78, scale: 'major', root: 52,
      kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
      hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      bass: true, pad: true, melody: true,
      padType: 'triangle', bassType: 'sawtooth', melType: 'triangle',
      pVol: 0.09, bVol: 0.13, mVol: 0.13, dVol: 0.55,
    },
    hiphop: {
      bpm: 88, scale: 'minor', root: 48,
      kick:  [1,0,0,0, 0,0,0,1, 1,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      bass: true, pad: true, melody: false,
      padType: 'sawtooth', bassType: 'sawtooth', melType: 'square',
      pVol: 0.07, bVol: 0.14, mVol: 0, dVol: 0.70,
    },
    bossa: {
      bpm: 92, scale: 'major', root: 57,
      kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0],
      bass: true, pad: true, melody: true,
      padType: 'triangle', bassType: 'triangle', melType: 'sine',
      pVol: 0.08, bVol: 0.10, mVol: 0.15, dVol: 0.40,
    },
    tribal: {
      bpm: 115, scale: 'pentatonic', root: 48,
      kick:  [1,0,0,0, 0,1,0,0, 1,0,0,0, 0,0,1,0],
      snare: [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,1,0,0],
      hihat: [1,0,1,0, 1,1,0,1, 0,1,0,1, 1,0,1,0],
      bass: false, pad: true, melody: true,
      padType: 'triangle', bassType: 'triangle', melType: 'triangle',
      pVol: 0.07, bVol: 0, mVol: 0.13, dVol: 0.75,
    },
    blues: {
      bpm: 85, scale: 'blues', root: 52,
      kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat: [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
      bass: true, pad: true, melody: true,
      padType: 'sawtooth', bassType: 'sawtooth', melType: 'sawtooth',
      pVol: 0.07, bVol: 0.12, mVol: 0.15, dVol: 0.50,
    },
    waltz: {
      bpm: 144, scale: 'major', root: 57,
      kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0],
      snare: [0,0,0,0, 1,0,0,0, 0,0,1,0, 0,0,0,0],
      hihat: [1,0,0,0, 1,0,0,0, 1,0,0,0, 0,0,0,0],
      bass: true, pad: true, melody: true,
      padType: 'triangle', bassType: 'triangle', melType: 'triangle',
      pVol: 0.08, bVol: 0.09, mVol: 0.17, dVol: 0.35,
    },
  };

  // ---- Prompt parser ----

  // Theme overrides checked first (most specific — movie/cultural references)
  // melSeq: 32-step array of absolute MIDI notes (null = rest). When present,
  //   replaces random melody generation so the theme is actually recognisable.
  // root overrides the genre default so bass/pad are in the right key.
  const N = null; // shorthand for rests in melSeq arrays
  const THEMES = [
    {
      words: ['lion king', 'hakuna matata', 'circle of life', 'simba'],
      genre: 'tribal', root: 48, bpm: 100, mVol: 0.22,
      // Circle of Life chant: E D G E  A G E D / E . D C  E G E .
      melSeq: [64,N,62,N, 67,N,64,N, 69,N,67,N, 64,N,62,N,
               64,N,N,N,  62,N,60,N, 64,N,67,N, 64,N,N,N],
    },
    {
      words: ['spider-man', 'spiderman', 'spider man', 'peter parker', 'web slinger', 'web crawler'],
      genre: 'folk', scale: 'minor', root: 45, bpm: 112, mVol: 0.22,
      // 1967 Spider-Man theme: E E G E / D D B D  (Spider-Man Spider-Man / does-what-ev-er)
      melSeq: [64,N,N,N, 64,N,N,N, 67,N,N,N, 64,N,N,N,
               62,N,N,N, 62,N,N,N, 59,N,N,N, 64,N,N,N],
    },
    {
      words: ['pirates of the caribbean', 'pirate', 'high seas', 'sailing'],
      genre: 'folk', scale: 'dorian', root: 45, bpm: 108, mVol: 0.22,
      // He's a Pirate run: C D Eb F  G F Eb D / C D Eb F  G F Eb .
      melSeq: [60,N,62,N, 63,N,65,N, 67,N,65,N, 63,N,62,N,
               60,N,62,N, 63,N,65,N, 67,N,65,N, 63,N,N,N],
    },
    {
      words: ['star wars', 'darth vader', 'force', 'jedi', 'lightsaber'],
      genre: 'classical', scale: 'minor', root: 48, bpm: 108, mVol: 0.24,
      // Main theme: G G G  Eb(below) Bb(below) / G Eb(below)  Bb(below) G
      melSeq: [67,N,N,N, 67,N,N,N, 67,N,N,N, 63,N,N,N,
               58,N,N,N, 67,N,N,N, 63,N,N,N, 58,N,67,N],
    },
    {
      words: ['space', 'galaxy', 'cosmic', 'sci-fi', 'scifi'],
      genre: 'ambient', scale: 'lydian',
    },
    { words: ['christmas', 'jingle', 'holiday', 'festive', 'santa', 'xmas'],  genre: 'waltz',   scale: 'major'  },
    { words: ['halloween', 'horror', 'scary', 'spooky', 'haunted'],           genre: 'ambient', scale: 'phrygian' },
    { words: ['hawaii', 'luau', 'polynesian', 'aloha', 'ukulele'],            genre: 'reggae',  scale: 'major'  },
    { words: ['adventure', 'epic journey', 'hero', 'quest'],                   genre: 'classical' },
    { words: ['romantic', 'love song', 'wedding', 'honeymoon'],               genre: 'jazz',    scale: 'major'  },
    { words: ['carnival', 'circus', 'funfair', 'fiesta'],                     genre: 'folk',    scale: 'major'  },
  ];

  // Genre keywords
  const GENRES_KW = [
    { words: ['techno', 'electronic', 'edm', 'rave', 'club', 'house', 'trance'], genre: 'techno' },
    { words: ['jazz', 'swing', 'bebop', 'smooth jazz', 'lounge'],                genre: 'jazz' },
    { words: ['ambient', 'atmospher', 'meditation', 'calm', 'peaceful', 'spa'],  genre: 'ambient' },
    { words: ['classical', 'orchestra', 'symphon', 'baroque', 'concert'],        genre: 'classical' },
    { words: ['folk', 'acoustic', 'country', 'bluegrass', 'irish', 'celtic'],    genre: 'folk' },
    { words: ['reggae', 'caribbean', 'island', 'tropical', 'beach', 'rasta'],   genre: 'reggae' },
    { words: ['hip hop', 'hiphop', 'rap', 'urban', 'boom bap', 'trap'],         genre: 'hiphop' },
    { words: ['bossa', 'samba', 'latin', 'brazil', 'bossanova'],                genre: 'bossa' },
    { words: ['lion king', 'africa', 'tribal', 'ethnic', 'world music', 'drum'],genre: 'tribal' },
    { words: ['blues', 'gospel', 'delta blues', 'bb king'],                      genre: 'blues' },
    { words: ['waltz', 'ballroom', 'tango', 'romance', 'paris'],                genre: 'waltz' },
  ];

  // Mood modifiers (applied on top of genre)
  const MOODS = [
    { words: ['somber', 'sad', 'dark', 'melanchol', 'gloomy', 'moody', 'low', 'depressing'], scale: 'minor',    factor: 0.80 },
    { words: ['happy', 'joyful', 'uplifting', 'bright', 'cheerful', 'fun', 'bubbly'],        scale: 'major',    factor: 1.10 },
    { words: ['epic', 'dramatic', 'cinematic', 'grand', 'majestic', 'soaring'],              scale: 'lydian',   factor: 0.90 },
    { words: ['mysterious', 'eerie', 'haunting', 'tense', 'suspense'],                       scale: 'phrygian', factor: 0.85 },
    { words: ['fast', 'energetic', 'upbeat', 'intense', 'aggressive', 'pump', 'hype'],       factor: 1.20 },
    { words: ['slow', 'relaxing', 'gentle', 'soft', 'chill', 'mellow', 'sleepy'],           factor: 0.72 },
  ];

  function parsePrompt(text) {
    const p = (text || '').toLowerCase();
    let profile    = Object.assign({}, G.default);
    let genreLabel = 'default';

    // 1. Theme references take priority
    for (const t of THEMES) {
      if (t.words.some(w => p.includes(w))) {
        profile    = Object.assign({}, G[t.genre] || G.default);
        genreLabel = t.genre;
        if (t.scale)  profile.scale  = t.scale;
        if (t.root)   profile.root   = t.root;
        if (t.bpm)    profile.bpm    = t.bpm;
        if (t.mVol)   profile.mVol   = t.mVol;
        if (t.melSeq) {
          profile.melSeq  = t.melSeq;
          profile.melody  = true;
          profile.melDur  = 3.6; // hold each note closer to a quarter note
        }
        break;
      }
    }

    // 2. Genre keywords (if no theme matched)
    if (genreLabel === 'default') {
      for (const k of GENRES_KW) {
        if (k.words.some(w => p.includes(w))) {
          profile    = Object.assign({}, G[k.genre] || G.default);
          genreLabel = k.genre;
          break;
        }
      }
    }

    // 3. Mood modifiers on top
    for (const m of MOODS) {
      if (m.words.some(w => p.includes(w))) {
        if (m.scale)  profile.scale = m.scale;
        if (m.factor) profile.bpm   = Math.round(profile.bpm * m.factor);
      }
    }

    profile.bpm = Math.max(50, Math.min(190, profile.bpm));
    const label = genreLabel.charAt(0).toUpperCase() + genreLabel.slice(1);
    profile._label = label + ' \u2022 ' + profile.scale + ' \u2022 ' + profile.bpm + ' bpm';
    return profile;
  }

  // ---- Web Audio synthesis ----

  let ac  = null;  // AudioContext
  let mg  = null;  // master GainNode
  let tid = null;  // scheduler setTimeout id
  let ap  = null;  // active profile
  let stp = 0, bar = 0, nxt = 0; // sequencer state
  let melPat = []; // 2-bar melody pattern (32 booleans / MIDI notes)

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function ensureCtx() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    mg = ac.createGain();
    mg.gain.value = 0.7;
    mg.connect(ac.destination);
  }

  // ---- Drum voices ----

  function kick(t, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(0.001, t + 0.45);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); g.connect(mg);
    o.start(t); o.stop(t + 0.5);
  }

  function snare(t, vol) {
    // Noise burst
    const len = Math.round(ac.sampleRate * 0.18);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dat[i] = Math.random() * 2 - 1;
    const ns = ac.createBufferSource(); ns.buffer = buf;
    const bf = ac.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2800;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(vol * 0.85, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    ns.connect(bf); bf.connect(ng); ng.connect(mg);
    ns.start(t); ns.stop(t + 0.2);
    // Body click
    const so = ac.createOscillator(), sg = ac.createGain();
    so.type = 'sine'; so.frequency.value = 200;
    sg.gain.setValueAtTime(vol * 0.45, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    so.connect(sg); sg.connect(mg); so.start(t); so.stop(t + 0.08);
  }

  function hihat(t, vol) {
    const len = Math.round(ac.sampleRate * 0.04);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dat[i] = Math.random() * 2 - 1;
    const ns = ac.createBufferSource(); ns.buffer = buf;
    const hf = ac.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 8500;
    const hg = ac.createGain();
    hg.gain.setValueAtTime(vol * 0.4, t);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    ns.connect(hf); hf.connect(hg); hg.connect(mg);
    ns.start(t); ns.stop(t + 0.05);
  }

  // ---- Harmonic voices ----

  // Pad: root + fifth, 3 detuned oscillators for a chorus-like shimmer.
  function padNote(freq, t, dur, type, vol) {
    const g = ac.createGain();
    g.connect(mg);
    const atk = Math.min(0.6, dur * 0.25);
    const rel = Math.min(0.6, dur * 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);
    [-8, 0, 8].forEach(det => {
      const o = ac.createOscillator();
      o.type = type || 'triangle'; o.frequency.value = freq; o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
    // Perfect fifth
    const g5 = ac.createGain(); g5.connect(mg);
    g5.gain.setValueAtTime(0, t);
    g5.gain.linearRampToValueAtTime(vol * 0.55, t + atk);
    g5.gain.setValueAtTime(vol * 0.55, t + dur - rel);
    g5.gain.linearRampToValueAtTime(0, t + dur);
    const o5 = ac.createOscillator();
    o5.type = type || 'triangle'; o5.frequency.value = freq * 1.4983; // just 5th
    o5.connect(g5); o5.start(t); o5.stop(t + dur + 0.05);
  }

  // Bass: low-pass filtered oscillator
  function bassNote(freq, t, dur, type, vol) {
    const o = ac.createOscillator();
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = ac.createGain();
    o.type = type || 'sawtooth'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol * 0.5, t + dur * 0.65);
    g.gain.linearRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(mg);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Melody: single oscillator with fast attack/release
  function melNote(freq, t, dur, type, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.setValueAtTime(vol * 0.7, t + dur - 0.025);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(mg);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---- Melody pattern generator ----
  // Builds a 32-step (2-bar) sequence of MIDI notes / nulls.
  // On strong beats it lands on the chord root; other steps use scale tones.
  function makeMelPat(profile) {
    // Hardcoded theme melody takes priority over random generation.
    if (profile.melSeq && profile.melSeq.length >= 32) return profile.melSeq.slice();

    const sc   = SCALES[profile.scale] || SCALES.major;
    const prog = PROGRESSIONS[profile.scale] || PROGRESSIONS.major;
    const root = profile.root + 12; // melody an octave above pad root
    const pat  = [];

    for (let b = 0; b < 2; b++) {
      const chordSemi = sc[prog[b % prog.length] % sc.length];
      for (let s = 0; s < 16; s++) {
        const restChance = (s % 2 === 1) ? 0.65 : 0.42;
        if (Math.random() < restChance) { pat.push(null); continue; }
        let semi;
        if (s % 4 === 0) {
          semi = chordSemi; // land on chord tone on the beat
        } else {
          semi = sc[Math.floor(Math.random() * sc.length)];
        }
        pat.push(root + semi);
      }
    }
    return pat;
  }

  // ---- Scheduler ----

  const STEPS = 16; // 16th notes per bar

  function scheduleStep(s, b, t) {
    const p      = ap;
    const sDur   = (60 / p.bpm) / 4; // 16th-note duration in seconds
    const barDur = sDur * STEPS;
    const sc     = SCALES[p.scale] || SCALES.major;
    const prog   = PROGRESSIONS[p.scale] || PROGRESSIONS.major;
    const cdSemi = sc[prog[b % prog.length] % sc.length]; // chord root semitone

    // Drums
    if (p.kick[s]  && p.dVol > 0) kick(t,  p.dVol);
    if (p.snare[s] && p.dVol > 0) snare(t, p.dVol);
    if (p.hihat[s] && p.dVol > 0) hihat(t, p.dVol);

    // Pad: whole bar, scheduled once at step 0
    if (p.pad && p.pVol > 0 && s === 0) {
      padNote(hz(p.root + cdSemi), t, barDur, p.padType, p.pVol);
    }

    // Bass: beats 1 and 3 (steps 0 and 8)
    if (p.bass && p.bVol > 0 && (s === 0 || s === 8)) {
      bassNote(hz(p.root + cdSemi - 12), t, sDur * 3.8, p.bassType, p.bVol);
    }

    // Melody
    if (p.melody && p.mVol > 0) {
      const idx = ((b % 2) * STEPS + s) % melPat.length;
      const n   = melPat[idx];
      if (n !== null) melNote(hz(n), t, sDur * (p.melDur || 1.7), p.melType, p.mVol);
    }
  }

  function tick() {
    if (!ap || !ac) return;
    if (ac.state === 'suspended') ac.resume();
    const ahead = 0.12; // seconds to schedule ahead
    while (nxt < ac.currentTime + ahead) {
      scheduleStep(stp, bar, nxt);
      nxt += (60 / ap.bpm) / 4;
      stp++;
      if (stp >= STEPS) {
        stp = 0;
        bar++;
        if (bar % 2 === 0) melPat = makeMelPat(ap); // refresh melody phrase every 2 bars
      }
    }
    tid = setTimeout(tick, 20);
  }

  // ---- Public API ----

  function start(prompt) {
    stop();
    ensureCtx();
    if (ac.state === 'suspended') ac.resume();
    ap     = parsePrompt(prompt);
    melPat = makeMelPat(ap);
    stp    = 0;
    bar    = 0;
    nxt    = ac.currentTime + 0.05;
    tick();
    return ap._label;
  }

  function stop() {
    if (tid) { clearTimeout(tid); tid = null; }
    ap = null;
  }

  function setVolume(v) {
    if (mg && ac) mg.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ac.currentTime, 0.05);
  }

  function isPlaying() { return !!ap; }

  window.WanderlustMusic = { start, stop, setVolume, isPlaying };

  // ---- UI wiring — called for both panels ----
  // fileInputId is optional: if provided, that <input type="file"> lets the
  // user pick a real audio file which plays instead of the synthesiser.
  function wirePanel(promptId, playId, stopId, volId, statusId, fileInputId) {
    const promptEl  = document.getElementById(promptId);
    const playBtn   = document.getElementById(playId);
    const stopBtn   = document.getElementById(stopId);
    const volEl     = document.getElementById(volId);
    const statusEl  = document.getElementById(statusId);
    const fileInput = fileInputId ? document.getElementById(fileInputId) : null;
    if (!playBtn) return;

    let fileAudio = null;
    let fileUrl   = null;

    function setStatus(text, playing) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.classList.toggle('playing', !!playing);
    }

    function stopFile() {
      if (fileAudio) { fileAudio.pause(); fileAudio.src = ''; fileAudio = null; }
      if (fileUrl)   { URL.revokeObjectURL(fileUrl); fileUrl = null; }
    }

    // Generate & Play synthesiser
    playBtn.addEventListener('click', function () {
      stopFile();
      const prompt = (promptEl && promptEl.value.trim()) || 'ambient travel music';
      const label  = start(prompt);
      setStatus('\u266b ' + label, true);
    });

    // Upload a real audio file
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        const file = fileInput.files[0];
        if (!file) return;
        stop();      // stop synthesiser
        stopFile();  // stop previous file
        fileUrl   = URL.createObjectURL(file);
        fileAudio = new Audio(fileUrl);
        fileAudio.loop   = true;
        fileAudio.volume = volEl ? parseFloat(volEl.value) : 0.7;
        fileAudio.play().catch(function () {});
        const name = file.name.length > 28 ? file.name.slice(0, 25) + '\u2026' : file.name;
        setStatus('\u266b ' + name, true);
        fileInput.value = ''; // allow re-selecting the same file
      });
    }

    // Stop everything
    stopBtn.addEventListener('click', function () {
      stop();
      stopFile();
      setStatus('Not playing', false);
    });

    // Volume — controls both synthesiser and file player
    if (volEl) {
      volEl.addEventListener('input', function () {
        const v = parseFloat(volEl.value);
        setVolume(v);
        if (fileAudio) fileAudio.volume = v;
      });
    }
  }

  wirePanel('photoMusicPrompt', 'photoMusicPlay', 'photoMusicStop', 'photoMusicVol', 'photoMusicStatus', 'photoMusicFile');
  wirePanel('videoMusicPrompt', 'videoMusicPlay', 'videoMusicStop', 'videoMusicVol', 'videoMusicStatus', 'videoMusicFile');
})();
