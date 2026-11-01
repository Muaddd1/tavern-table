# Generates the ambience and music loops, so every sound in the app is original and license-free.
# Run: python scripts/gen-audio.py   (needs numpy and ffmpeg). Output: public/audio/*.mp3
import os, subprocess, sys
import numpy as np

SR = 22050
LEN = 24
N = SR * LEN
OUT = "public/audio"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1)


def filtered_noise(cutoff, slow=0.0):
    """Noise through a one-pole low-pass, computed in frequency space so it loops seamlessly."""
    spec = np.fft.rfft(rng.standard_normal(N))
    freqs = np.fft.rfftfreq(N, 1 / SR)
    spec *= 1 / np.sqrt(1 + (freqs / cutoff) ** 2)
    out = np.fft.irfft(spec, N)
    return out / (np.abs(out).max() + 1e-9)


def swell(period, depth=0.6, phase=0.0):
    """A slow volume movement with a whole number of cycles, so it also loops."""
    t = np.arange(N) / SR
    cycles = max(1, round(LEN / period))
    return 1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * cycles * t / LEN + phase))


def events(count, make, wrap=True):
    out = np.zeros(N)
    for _ in range(count):
        s = make()
        at = rng.integers(0, N)
        idx = (at + np.arange(len(s))) % N
        out[idx] += s
    return out


def drip():
    f = rng.uniform(900, 1700)
    n = int(SR * 0.22)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (f + 900 * t) * t) * np.exp(-t * 28) * rng.uniform(0.25, 0.6)


def crackle():
    n = int(SR * rng.uniform(0.006, 0.03))
    return rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 4)) * rng.uniform(0.1, 0.5)


def cricket():
    n = int(SR * 0.28)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * rng.uniform(3800, 4400) * t) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 38 * t))) * np.exp(-t * 5) * 0.09


def creak():
    n = int(SR * rng.uniform(0.5, 1.1))
    t = np.arange(n) / SR
    env = np.sin(np.pi * t / t[-1])
    return np.sin(2 * np.pi * (rng.uniform(170, 260) + 45 * np.sin(2 * np.pi * 2 * t)) * t) * env * 0.12


def tone(freq, amp=1.0):
    cycles = round(freq * LEN)
    t = np.arange(N) / SR
    return amp * np.sin(2 * np.pi * cycles * t / LEN)


def pad(notes, period=12):
    out = np.zeros(N)
    for i, f in enumerate(notes):
        out += (tone(f) + 0.4 * tone(f * 2) + 0.2 * tone(f * 1.5)) * swell(period, 0.7, i * 1.3)
    return out


AMBIENCE = {
    "dungeon": lambda: filtered_noise(90) * 0.55 * swell(12, 0.3) + events(14, drip) + events(40, crackle) * 0.5,
    "cave": lambda: filtered_noise(60) * 0.7 * swell(8, 0.4) + events(22, drip) * 0.8,
    "forest": lambda: filtered_noise(700) * 0.25 * swell(8, 0.7) + events(70, cricket),
    "tavern": lambda: filtered_noise(420) * 0.5 * swell(3, 0.45) + filtered_noise(1100) * 0.12 * swell(2, 0.7, 1) + events(60, crackle) * 0.5,
    "castle": lambda: filtered_noise(250) * 0.5 * swell(12, 0.75) + filtered_noise(70) * 0.3,
    "ship": lambda: filtered_noise(500) * 0.55 * swell(6, 0.85) + filtered_noise(120) * 0.3 * swell(6, 0.6, 2) + events(9, creak),
    "desert": lambda: filtered_noise(1200) * 0.28 * swell(12, 0.8) + filtered_noise(200) * 0.28 * swell(8, 0.6, 1),
    "infernal": lambda: filtered_noise(55) * 0.85 * swell(4, 0.3) + events(160, crackle) + tone(41, 0.12),
}
MUSIC = {
    "calm": lambda: pad([110, 165, 220, 277.2]),
    "tense": lambda: pad([73.4, 110, 155.6, 220], 6) * 0.9,
    "battle": lambda: pad([82.4, 123.5, 164.8], 3) + tone(41.2, 0.5) * (np.sign(np.sin(2 * np.pi * 36 * np.arange(N) / LEN)) * 0.5 + 0.5),
}


def write(name, signal):
    signal = signal / (np.abs(signal).max() + 1e-9) * 0.8
    path = f"{OUT}/{name}.mp3"
    p = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", "-b:a", "48k", path], input=signal.astype(np.float32).tobytes())
    if p.returncode:
        sys.exit(f"ffmpeg failed on {name}")
    print(name, os.path.getsize(path) // 1024, "KB")


for name, make in AMBIENCE.items():
    write(f"ambience-{name}", make())
for name, make in MUSIC.items():
    write(f"music-{name}", make())
