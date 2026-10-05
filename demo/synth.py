"""Synthesize the demo narration with Piper (offline neural TTS).

Reads narration/texts.json (written by `DRY=1 node record-demo.mjs`) and writes
one WAV per line to narration/cache/, plus narration/index.json with durations.
"""

import hashlib
import json
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

HERE = Path(__file__).parent
NARRATION = HERE / "narration"
CACHE = NARRATION / "cache"
VOICE = HERE / "voices" / "en_US-lessac-high.onnx"


def key(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]


def main() -> None:
    texts = json.loads((NARRATION / "texts.json").read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(str(VOICE))
    config = SynthesisConfig(length_scale=0.92, noise_scale=0.6, noise_w_scale=0.8)
    index = {}
    for i, text in enumerate(texts, 1):
        path = CACHE / f"{key(text)}.wav"
        if not path.exists():
            with wave.open(str(path), "wb") as wf:
                voice.synthesize_wav(text, wf, syn_config=config)
        with wave.open(str(path), "rb") as wf:
            duration = wf.getnframes() / wf.getframerate()
        index[text] = {"file": str(path), "duration": round(duration, 3)}
        print(f"[{i}/{len(texts)}] {duration:4.1f}s  {text[:70]}")
    (NARRATION / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Narration ready: {len(index)} clips, {sum(v['duration'] for v in index.values()) / 60:.1f} min of speech")


if __name__ == "__main__":
    main()
