from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import hmac
import hashlib
import secrets
import struct
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

app = FastAPI()

# Allow frontend (local file or deployed site) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production, restrict this
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- CONFIG -----
# Core server seed for provably fair HMAC generation.
SERVER_SEED = os.getenv("SERVER_SEED") or secrets.token_hex(32)
SERVER_SEED_HASH = hashlib.sha256(SERVER_SEED.encode()).hexdigest()

# Tunable parameters for multiplier distribution
PARETO_EXP = float(os.getenv("PF_PARETO_EXP", "0.58"))
START_MULT = float(os.getenv("PF_START_MULT", "1.90"))
MAX_MULT = float(os.getenv("PF_MAX_MULT", "10000.0"))


# ----- MODELS -----
class SeedHash(BaseModel):
    serverSeedHash: str


class FlipResponse(BaseModel):
    choice: str
    result: str
    win: bool
    serverSeedHash: str
    clientSeed: Optional[str] = None
    nonce: Optional[int] = None


class RoundOut(BaseModel):
    bustPoint: float
    serverSeedHash: str
    clientSeed: str
    nonce: int


class RevealOut(BaseModel):
    revealedServerSeed: str
    previousServerSeedHash: str
    newServerSeedHash: str


# ----- PROVABLY FAIR CORE -----
def hmac_bytes(server_seed: str, client_seed: str, nonce: int) -> bytes:
    """
    Core PF function: HMAC_SHA256(serverSeed, clientSeed:nonce)
    """
    msg = f"{client_seed}:{nonce}".encode()
    return hmac.new(server_seed.encode(), msg, hashlib.sha256).digest()


def bytes_to_uniform(b: bytes) -> float:
    """
    Convert first 8 bytes to a float in (0, 1).
    """
    n = struct.unpack(">Q", b[:8])[0]
    u = (n + 1) / (2**64 + 1)
    return u


def pareto_bust(u: float) -> float:
    """
    Convert uniform u into a crash-style multiplier.
    """
    bust = START_MULT * pow(1.0 / (1.0 - u), PARETO_EXP)
    # Clamp to [START_MULT, MAX_MULT]
    return min(max(bust, START_MULT), MAX_MULT)


def fair_coin(b: bytes) -> str:
    """
    Decide Heads/Tails from first byte.
    """
    return "Heads" if (b[0] % 2 == 0) else "Tails"


# ----- ROUTES -----
@app.get("/", response_model=SeedHash)
@app.get("/seed", response_model=SeedHash)
def seed_hash() -> SeedHash:
    """
    Return the current server seed hash so players can lock it in before rounds.
    """
    return SeedHash(serverSeedHash=SERVER_SEED_HASH)


@app.get("/round", response_model=RoundOut)
def get_round(clientSeed: str = "guest", nonce: int = 0) -> RoundOut:
    """
    Generate the bust multiplier for a given clientSeed + nonce.
    """
    b = hmac_bytes(SERVER_SEED, clientSeed, nonce)
    u = bytes_to_uniform(b)
    bust = pareto_bust(u)
    return RoundOut(
        bustPoint=float(bust),
        serverSeedHash=SERVER_SEED_HASH,
        clientSeed=clientSeed,
        nonce=nonce,
    )


@app.get("/flip", response_model=FlipResponse)
def flip(
    choice: str = Query(..., pattern="^(Heads|Tails)$"),
    clientSeed: str = "guest",
    nonce: int = 0,
) -> FlipResponse:
    """
    Decide the coin outcome using the exact same HMAC( serverSeed, clientSeed:nonce ).
    """
    b = hmac_bytes(SERVER_SEED, clientSeed, nonce)
    result = fair_coin(b)
    return FlipResponse(
        choice=choice,
        result=result,
        win=(choice == result),
        serverSeedHash=SERVER_SEED_HASH,
        clientSeed=clientSeed,
        nonce=nonce,
    )


@app.post("/reveal", response_model=RevealOut)
def reveal_and_rotate() -> RevealOut:
    """
    Reveal the current serverSeed so past rounds can be verified,
    then rotate to a new one and publish its hash.
    """
    global SERVER_SEED, SERVER_SEED_HASH

    revealed = SERVER_SEED
    previous_hash = SERVER_SEED_HASH

    # Rotate
    SERVER_SEED = secrets.token_hex(32)
    SERVER_SEED_HASH = hashlib.sha256(SERVER_SEED.encode()).hexdigest()

    return RevealOut(
        revealedServerSeed=revealed,
        previousServerSeedHash=previous_hash,
        newServerSeedHash=SERVER_SEED_HASH,
    )
