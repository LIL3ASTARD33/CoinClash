from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import hmac
import hashlib
import secrets
import math

app = FastAPI(title="Coin Clash Provably Fair API")

# CORS – wide open for prototype; lock this down later if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
#  Provably Fair Core
# =========================

# On startup, generate a random secret server seed.
# In a real casino environment this would be stored and rotated
# with an admin system, not regenerated on each restart.
_SERVER_SEED = secrets.token_bytes(32)
_SERVER_SEED_HASH = hashlib.sha256(_SERVER_SEED).hexdigest()


def _hmac_digest(client_seed: str, nonce: int, tag: str) -> bytes:
    """
    Deterministic HMAC-SHA256 over:  (clientSeed : nonce : tag)

    tag lets us derive different random streams independently:
      - "bust"  for the multiplier
      - "coin"  for the coin result
    """
    msg = f"{client_seed}:{nonce}:{tag}".encode("utf-8")
    return hmac.new(_SERVER_SEED, msg, hashlib.sha256).digest()


def _digest_to_float(digest: bytes) -> float:
    """
    Convert first 8 bytes of a digest into a float in [0, 1).
    """
    n = int.from_bytes(digest[:8], "big")
    return n / 2**64


def generate_bust_point(client_seed: str, nonce: int) -> float:
    """
    Generate a crash-style bust multiplier using an exponential curve.

    This does NOT try to copy any casino’s exact formula.
    It just needs to be:
      - deterministic
      - unbiased given HMAC output
      - reasonably shaped (lots of low busts, rare high busts)
    """
    r = _digest_to_float(_hmac_digest(client_seed, nonce, "bust"))
    # Avoid exactly 0 or 1, which would break log()
    r = max(1e-12, min(1 - 1e-12, r))

    # Exponential-ish distribution:
    # mean a bit above 2x, long tail of bigger multipliers
    bust = 1.0 + (-math.log(1.0 - r) * 1.3)

    # Cap for UI sanity (you can tweak this)
    bust = min(bust, 50.0)
    return round(bust, 2)


def generate_coin_result(client_seed: str, nonce: int) -> str:
    """
    Deterministic coin flip based on same PF inputs but different tag.
    """
    r = _digest_to_float(_hmac_digest(client_seed, nonce, "coin"))
    return "Heads" if r < 0.5 else "Tails"


# =========================
#  API Endpoints
# =========================

@app.get("/")
def home():
    return {"message": "Welcome to Coin Clash – Provably Fair API"}


@app.get("/seed")
def get_seed_hash():
    """
    Frontend calls this once to display the hash of the secret server seed.

    Players can screenshot or record this hash BEFORE playing.
    When you later reveal the underlying server seed, they can
    recompute every outcome and verify you never changed anything.
    """
    return {"serverSeedHash": _SERVER_SEED_HASH}


@app.get("/round")
def get_round(
    clientSeed: str = Query(..., description="Client-chosen seed string"),
    nonce: int = Query(..., ge=0, description="Monotonic round counter"),
):
    """
    Returns the deterministic bust multiplier for this (clientSeed, nonce).

    Your frontend already calls:
      GET /round?clientSeed=...&nonce=...

    and expects:
      { "bustPoint": <number> }
    """
    bust_point = generate_bust_point(clientSeed, nonce)
    return {"bustPoint": bust_point}


@app.get("/flip")
def flip(
    choice: str = Query(..., description="Player choice: Heads or Tails"),
    clientSeed: str = Query(..., description="Client-chosen seed string"),
    nonce: int = Query(..., ge=0, description="Monotonic round counter"),
):
    """
    Returns a deterministic coin result tied to the same provably fair
    seeds as /round. The frontend calls:

      GET /flip?choice=Heads&clientSeed=...&nonce=...

    and expects a JSON object with at least:
      - result  ("Heads" or "Tails")
      - win     (bool)
    """
    choice_clean = choice.capitalize()
    if choice_clean not in {"Heads", "Tails"}:
        return {"error": "choice must be 'Heads' or 'Tails'"}

    result = generate_coin_result(clientSeed, nonce)
    win = (choice_clean == result)

    return {
        "choice": choice_clean,
        "result": result,
        "win": win,
        "clientSeed": clientSeed,
        "nonce": nonce,
        "serverSeedHash": _SERVER_SEED_HASH,
    }
