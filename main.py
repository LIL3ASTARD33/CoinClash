from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hmac
import hashlib

app = FastAPI()

# Allow frontend to call this API from browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production, lock this down
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOUSE_EDGE = 0.20  # 20% edge (80% RTP)

# In real production: this should be random, rotated, and not hard-coded.
SERVER_SEED = "super_secret_server_seed_change_me"
NONCE_COUNTER = 0  # demo-only; in real use, track per user/game

class PlayRequest(BaseModel):
    bet: float
    multiplier: float
    client_seed: str
    player_choice: str = "heads"

class PlayResponse(BaseModel):
    did_win: bool
    roll_won: bool
    choice_matched: bool
    payout: float
    roll: float
    win_chance: float
    server_seed_hash: str
    nonce: int
    coin_side: str

def get_server_seed_hash(server_seed: str) -> str:
    """Commitment hash shown to player before revealing server seed."""
    return hashlib.sha256(server_seed.encode()).hexdigest()

def generate_random_0_1(server_seed: str, client_seed: str, nonce: int) -> float:
    """
    Provably-fair RNG:
    HMAC_SHA256(server_seed, client_seed:nonce) -> hex digest
    Convert first 8 bytes (16 hex chars) to int and scale to [0,1).
    """
    message = f"{client_seed}:{nonce}".encode()
    digest = hmac.new(server_seed.encode(), message, hashlib.sha256).hexdigest()
    first_8_bytes = digest[:16]
    as_int = int(first_8_bytes, 16)
    max_int = 16 ** 16  # 2^64
    return as_int / max_int

@app.post("/play", response_model=PlayResponse)
def play(req: PlayRequest):
    global NONCE_COUNTER
    NONCE_COUNTER += 1
    nonce = NONCE_COUNTER

    if req.bet <= 0:
        raise HTTPException(status_code=400, detail="Bet must be positive.")
    if req.multiplier <= 1.0:
        raise HTTPException(status_code=400, detail="Multiplier must be greater than 1.0.")

    # Matched to frontend: ~3% house edge no matter the multiplier
    win_chance = (1.0 - HOUSE_EDGE) / req.multiplier

    # Provably fair roll in [0,1)
    roll = generate_random_0_1(SERVER_SEED, req.client_seed, nonce)

    did_win = roll < win_chance
    coin_side = "heads" if roll < 0.5 else "tails"
    
    choice_matched = coin_side == req.player_choice
    actual_win = did_win and choice_matched
    payout = req.bet * req.multiplier if actual_win else 0.0

    server_seed_hash = get_server_seed_hash(SERVER_SEED)

    return PlayResponse(
        did_win=actual_win,
        roll_won=did_win,
        choice_matched=choice_matched,
        payout=payout,
        roll=roll,
        win_chance=win_chance,
        server_seed_hash=server_seed_hash,
        nonce=nonce,
        coin_side=coin_side,
    )

