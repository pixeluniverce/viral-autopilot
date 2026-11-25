"""Render worker (runs in GitHub Actions).

MODE=auto : Claude writes a hook-first script -> edge-tts voice -> Pexels footage -> captions -> 9:16 mp4
MODE=clip : download a link -> Whisper transcript -> Claude picks viral moments -> 9:16 clips with captions
"""
import asyncio
import json
import os
import pathlib
import random
import re
import subprocess

import requests

WORK = pathlib.Path("work").resolve()
OUT = pathlib.Path("out").resolve()
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")


# ---------------------------------------------------------------- helpers
def run(cmd, **kw):
    cmd = [str(c) for c in cmd]
    print("$", " ".join(cmd)[:300], flush=True)
    subprocess.run(cmd, check=True, **kw)


def probe_duration(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)]
    )
    return float(out.strip())


def probe_size(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
         "-of", "csv=p=0", str(path)]
    )
    w, h = out.decode().strip().split(",")[:2]
    return int(w), int(h)


def llm_json(prompt, max_tokens=2500):
    import anthropic

    client = anthropic.Anthropic()
    msg = client.messages.create(model=MODEL, max_tokens=max_tokens, messages=[{"role": "user", "content": prompt}])
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
    m = re.search(r"(\{.*\}|\[.*\])", text, re.S)
    if not m:
        raise RuntimeError("LLM did not return JSON: " + text[:200])
    return json.loads(m.group(1))


def clean_tags(tags, extra=()):
    out = []
    for t in list(tags or []) + list(extra):
        t = "#" + re.sub(r"[^\w]", "", str(t).lstrip("#"))
        if len(t) > 1 and t.lower() not in [x.lower() for x in out]:
            out.append(t)
    return out[:12]


# ---------------------------------------------------------------- captions
ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans,88,&H0000F0FF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,7,2,2,60,60,520,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ass_ts(t):
    cs = int(round(max(t, 0) * 100))
    return f"{cs // 360000}:{cs % 360000 // 6000:02d}:{cs % 6000 // 100:02d}.{cs % 100:02d}"


def write_ass(words, path, offset=0.0):
    """words: [(start, end, text)] in absolute seconds. Shows 2-3 words at a time."""
    lines, chunk = [], []

    def flush():
        if not chunk:
            return
        txt = " ".join(w[2] for w in chunk)
        if txt.isascii():
            txt = txt.upper()
        txt = txt.replace("{", "(").replace("}", ")")
        lines.append(
            f"Dialogue: 0,{ass_ts(chunk[0][0] - offset)},{ass_ts(chunk[-1][1] - offset)},Default,,0,0,0,,{txt}"
        )
        chunk.clear()

    for w in words:
        chunk.append(w)
        if len(chunk) >= 3 or re.search(r"[.!?,;:।]$", w[2]):
            flush()
    flush()
    pathlib.Path(path).write_text(ASS_HEAD + "\n".join(lines) + "\n", encoding="utf-8")


def even_words(text, duration):
    toks = text.split()
    step = duration / max(len(toks), 1)
    return [(i * step, (i + 1) * step, w) for i, w in enumerate(toks)]


# ---------------------------------------------------------------- AUTO mode
async def tts(text, voice, mp3):
    import edge_tts

    kw = {"rate": os.getenv("TTS_RATE", "+5%")}
    try:
        comm = edge_tts.Communicate(text, voice, boundary="WordBoundary", **kw)
    except TypeError:
        comm = edge_tts.Communicate(text, voice, **kw)
    words = []
    with open(mp3, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                s = ch["offset"] / 1e7
                words.append((s, s + ch["duration"] / 1e7, ch["text"]))
    return words


def pexels_clip(query, dest, used):
    key = os.getenv("PEXELS_API_KEY")
    if not key:
        return False
    try:
        r = requests.get(
            "https://api.pexels.com/videos/search",
            params={"query": query, "orientation": "portrait", "size": "medium", "per_page": 10},
            headers={"Authorization": key},
            timeout=30,
        )
        r.raise_for_status()
        vids = [v for v in r.json().get("videos", []) if v["id"] not in used and v.get("duration", 0) >= 4]
        if not vids:
            return False
        v = random.choice(vids[:4])
        used.add(v["id"])
        files = [f for f in v["video_files"] if f.get("file_type") == "video/mp4"]
        portrait = [f for f in files if f.get("height", 0) >= f.get("width", 0)]
        files = portrait or files
        files.sort(key=lambda f: abs(f.get("height", 0) - 1920))
        with requests.get(files[0]["link"], stream=True, timeout=120) as d:
            d.raise_for_status()
            with open(dest, "wb") as fh:
                for c in d.iter_content(1 << 20):
                    fh.write(c)
        return True
    except Exception as e:  # noqa: BLE001
        print("pexels failed for", query, e)
        return False


def make_auto():
    niche = os.getenv("NICHE") or "amazing facts, motivation, smart money tips, tech tricks"
    topic = os.getenv("TOPIC", "").strip()
    recent = os.getenv("RECENT", "").strip()
    language = os.getenv("LANGUAGE_NAME") or "English"
    voice = os.getenv("TTS_VOICE") or "en-US-AndrewNeural"

    prompt = f"""You are a short-form video strategist for YouTube Shorts and Instagram Reels.
Channel niche: {niche}
Language of the voice-over: {language}
Topic: {topic or "Pick ONE fresh, high-curiosity topic in the niche that people love to watch to the end and share."}
Do NOT repeat these recent videos: {recent or "none"}

Write ONE video. Rules:
- The first sentence is a scroll-stopping hook (curiosity gap, bold claim or surprising question).
- 95-125 words of voice-over, short punchy sentences, conversational, no stage directions, no emojis.
- Only use facts that are well-known and verifiable. Never invent statistics, studies or quotes.
- Finish with a line that makes people comment or follow (a question works well).
- 6 to 8 'scenes': English stock-footage search queries (2-3 concrete words each) in visual order.

Return ONLY JSON:
{{"title": "<=70 chars, curiosity title", "script": "...", "scenes": ["..."], "description": "2 short sentences", "hashtags": ["#a","#b","... 8 items"]}}"""
    data = llm_json(prompt)

    title = data["title"].strip()
    script = re.sub(r"\s+", " ", data["script"]).strip()
    scenes = [s for s in data.get("scenes", []) if s][:8] or [niche.split(",")[0]]

    mp3 = WORK / "voice.mp3"
    words = asyncio.run(tts(script, voice, mp3))
    audio_dur = probe_duration(mp3)
    if not words:
        words = even_words(script, audio_dur)
    write_ass(words, WORK / "cap.ass")

    dur = audio_dur + 0.5
    seg = dur / len(scenes)
    used, parts = set(), []
    for i, q in enumerate(scenes):
        raw, part = WORK / f"raw{i}.mp4", WORK / f"part{i}.mp4"
        if pexels_clip(q, raw, used):
            src = ["-stream_loop", "-1", "-i", raw]
        else:
            src = ["-f", "lavfi", "-i", "color=c=0x1e293b:s=1080x1920:r=30"]
        run(["ffmpeg", "-y", "-loglevel", "error", *src, "-t", f"{seg:.3f}", "-vf",
             "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", part])
        parts.append(part)

    (WORK / "list.txt").write_text("".join(f"file '{p}'\n" for p in parts))
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", WORK / "list.txt",
         "-c", "copy", WORK / "base.mp4"])

    final = OUT / "video0.mp4"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", "base.mp4", "-i", "voice.mp3", "-vf", "ass=cap.ass",
         "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
         "-c:a", "aac", "-b:a", "160k", "-t", f"{dur:.3f}", "-movflags", "+faststart", final], cwd=WORK)

    return [{"file": str(final), "title": title, "description": data.get("description", ""),
             "hashtags": clean_tags(data.get("hashtags"), ["Shorts", "Reels"]), "duration": dur}]


# ---------------------------------------------------------------- CLIP mode
def make_clip():
    url = os.environ["SRC_URL"]
    count = int(os.getenv("CLIP_COUNT", "3"))

    cmd = ["yt-dlp", "--no-playlist", "--write-info-json", "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
           "--merge-output-format", "mp4", "-o", str(WORK / "src.%(ext)s")]
    cookies = os.getenv("YT_COOKIES", "").strip()
    if cookies:
        (WORK / "cookies.txt").write_text(cookies)
        cmd += ["--cookies", str(WORK / "cookies.txt")]
    run(cmd + [url])

    src = WORK / "src.mp4"
    info = {}
    if (WORK / "src.info.json").exists():
        info = json.loads((WORK / "src.info.json").read_text())
    src_title = info.get("title", "")
    credit = f"\n\nOriginal video: {src_title} ({info.get('channel') or info.get('uploader') or 'source'}) - {url}"
    total = probe_duration(src)

    audio = WORK / "audio.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-t", "2700", "-vn", "-ac", "1", "-ar", "16000", audio])

    from faster_whisper import WhisperModel

    model = WhisperModel(os.getenv("WHISPER_MODEL", "base"), device="cpu", compute_type="int8")
    segs, _ = model.transcribe(str(audio), word_timestamps=True, vad_filter=True)
    words, lines = [], []
    for s in segs:
        lines.append(f"[{s.start:.1f}] {s.text.strip()}")
        for w in s.words or []:
            words.append((w.start, w.end, w.word.strip()))
    if not words:
        raise RuntimeError("No speech found in this video, so clips cannot be chosen.")
    transcript = "\n".join(lines)[:70000]

    prompt = f"""You are an expert short-form video editor (YouTube Shorts / Instagram Reels).
Source video: "{src_title}" ({total:.0f}s long). Transcript lines look like "[start_seconds] text":

{transcript}

Pick the {count} best moments for viral clips. Rules:
- Each clip 25-55 seconds, self-contained, non-overlapping.
- Start at the beginning of a sentence with a strong hook; end right after the payoff.
- Use start/end seconds that exist in the transcript.
- Title <=70 chars with a curiosity hook. Description: 2 short sentences. 8 hashtags.

Return ONLY JSON: {{"clips": [{{"start": 12.3, "end": 50.1, "title": "...", "description": "...", "hashtags": ["#a"]}}]}}"""
    picks = llm_json(prompt, 3000)["clips"]

    w_src, h_src = probe_size(src)
    portrait = h_src > w_src
    results = []
    for i, c in enumerate(picks[:count]):
        start = max(float(c["start"]), 0)
        end = min(float(c["end"]), total)
        if end - start > 70:
            end = start + 55
        if end - start < 12:
            continue
        sel = [w for w in words if w[0] >= start - 0.05 and w[1] <= end + 0.05]
        write_ass(sel, WORK / f"cap{i}.ass", offset=start)

        if portrait:
            graph = f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,ass=cap{i}.ass,format=yuv420p[v]"
        else:
            graph = ("[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
                     "boxblur=25:5[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,"
                     f"ass=cap{i}.ass,format=yuv420p[v]")
        final = OUT / f"video{i}.mp4"
        run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-t", f"{end - start:.2f}", "-i", src,
             "-filter_complex", graph, "-map", "[v]", "-map", "0:a?", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "160k",
             "-movflags", "+faststart", final], cwd=WORK)
        results.append({"file": str(final), "title": c["title"].strip(),
                        "description": c.get("description", "") + credit,
                        "hashtags": clean_tags(c.get("hashtags"), ["Shorts", "Reels"]),
                        "duration": end - start})
    if not results:
        raise RuntimeError("No usable clips were found.")
    return results


# ---------------------------------------------------------------- main
if __name__ == "__main__":
    WORK.mkdir(exist_ok=True)
    OUT.mkdir(exist_ok=True)
    mode = os.getenv("MODE", "auto")
    results = make_clip() if mode == "clip" else make_auto()
    (OUT / "result.json").write_text(json.dumps({"jobId": os.environ.get("JOB_ID"), "results": results}))
    print("Done:", [r["title"] for r in results])
