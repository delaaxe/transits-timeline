#!/usr/bin/env python3
"""
Generate astrology transit aspect paragraphs via OpenAI API.

Output:
  - checkpoint.json (incremental)
  - final.json      (merged dict keyed by "Planet-aspect-Planet")

Requires:
  pip install openai
Env:
  export OPENAI_API_KEY="..."
"""

import json
import os
import random
import time
from typing import Dict, List

from openai import OpenAI

# -------------------------
# Config
# -------------------------
model_name = "gpt-5.2-chat-latest"
batch_size = int(os.getenv("BATCH_SIZE", "12"))  # 8–20 is typical; lower if you hit rate limits
max_retries = 8
out_checkpoint = "checkpoint.json"
out_final = "final.json"

bodies = [
    "sun", "moon", "mercury", "venus", "mars",
    "jupiter", "saturn", "uranus", "neptune", "pluto",
    "chiron", "mc",
]

aspects = ["conjunction", "sextile", "square", "trine", "opposition"]

# Ordered pairs INCLUDING self aspects: n^2
def all_keys() -> List[str]:
    keys = []
    for p1 in bodies:
        for p2 in bodies:
            for a in aspects:
                keys.append(f"{p1}-{a}-{p2}")
    return keys


# -------------------------
# Structured Output schema
# -------------------------
# We return a list of key/value items, then merge into a dict locally.
# This avoids the "dynamic keys" limitation in JSON Schema.
schema = {
    "name": "aspect_paragraph_batch",
    "schema": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string"},
                        "value": {"type": "string"}
                    },
                    "required": ["key", "value"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["items"],
        "additionalProperties": False
    }
}


system_style = """You write natural, nuanced astrological transit descriptions.
No templates, no obvious formula, no robotic repetition.
Keep aspect tone accurate:
- trine/sextile: supportive, flowing, opportunity-based (not harsh).
- square/opposition: challenging but constructive, not doom.
- conjunction: intensified, focused, potent.
Write one paragraph per key, 70–120 words, in clear English.
Avoid claims of certainty; use transit-style language ("can", "often", "tends to").
Do NOT mention degrees, orbs, houses, or signs.
Do NOT output markdown. Plain text only for values.
"""

user_instructions = """Write a paragraph for each key of the form "Planet-aspect-Planet".
Interpret as: transiting {first planet} making the {aspect} to natal {second planet},
in a general transit sense. Keep each paragraph distinct.

Return JSON only, matching the provided schema.
"""


# -------------------------
# Retry helpers
# -------------------------
def backoff_sleep(attempt: int):
    # exponential backoff + jitter
    base = min(60, (2 ** attempt))
    time.sleep(base + random.random())

def load_checkpoint() -> Dict[str, str]:
    if os.path.exists(out_checkpoint):
        with open(out_checkpoint, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_checkpoint(d: Dict[str, str]):
    tmp = out_checkpoint + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    os.replace(tmp, out_checkpoint)


# -------------------------
# OpenAI call
# -------------------------
client = OpenAI()

def generate_batch(batch_keys: List[str]) -> Dict[str, str]:
    # Provide keys explicitly to reduce drift
    key_list = "\n".join(batch_keys)

    prompt = f"""{user_instructions}

Keys:
{key_list}
"""

    for attempt in range(max_retries):
        try:
            resp = client.responses.create(
                model=model_name,
                input=[
                    {"role": "system", "content": system_style},
                    {"role": "user", "content": prompt},
                ],
                # Structured Outputs (Responses API)
                text={
                    "format": {
                        "type": "json_schema",
                        "name": schema["name"],
                        "schema": schema["schema"],
                        "strict": True,
                    }
                },
            )

            # Responses API returns parsed JSON in output_text
            # The SDK may expose parsed data differently depending on version;
            # safest: parse resp.output_text as JSON.
            raw = resp.output_text
            data = json.loads(raw)

            out: Dict[str, str] = {}
            for item in data["items"]:
                k = item["key"].strip()
                v = " ".join(item["value"].split())  # normalize whitespace
                out[k] = v

            # Ensure we got everything we asked for
            missing = [k for k in batch_keys if k not in out]
            if missing:
                raise ValueError(f"Missing keys in response: {missing[:5]} ... ({len(missing)} missing)")

            return out

        except Exception as e:
            # Rate limits and transient issues: backoff and retry
            if attempt == max_retries - 1:
                raise
            backoff_sleep(attempt)

    raise RuntimeError("Unreachable")


# -------------------------
# Main
# -------------------------
def main():
    keys = all_keys()
    total = len(keys)  # 12*12*5 = 720
    done = load_checkpoint()

    remaining = [k for k in keys if k not in done]
    print(f"Total keys: {total}")
    print(f"Already done: {len(done)}")
    print(f"Remaining: {len(remaining)}")

    i = 0
    while i < len(remaining):
        batch = remaining[i:i + batch_size]
        print(f"\nBatch {i//batch_size + 1} | size {len(batch)} | progress {len(done)}/{total}")

        batch_out = generate_batch(batch)
        done.update(batch_out)
        save_checkpoint(done)

        i += batch_size

    # write final merged dict
    with open(out_final, "w", encoding="utf-8") as f:
        json.dump(done, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {out_final} with {len(done)} entries.")

if __name__ == "__main__":
    main()
