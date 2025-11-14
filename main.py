from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
import hmac
import hashlib
import time
from collections import defaultdict
from typing import Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MIN_BET = 0.10
MAX_BET = 20000.00
MIN_MULTIPLIER = 1.96
MAX_MULTIPLIER = 10000.00
RTP = 0.98

SERVER_SEED = "super_secret_server_seed_change_me"
NONCE_COUNTER = 0

RATE_LIMIT_WINDOW = 2
RATE_LIMIT_MAX_REQUESTS = 5

rate_limit_store: Dict[str, list] = defaultdict(list)

class PlayRequest(BaseModel):
    bet: float
    multiplier: float
    client_seed: str
    player_choice: str = "heads"

    @validator('bet')
    def validate_bet(cls, v):
        if not isinstance(v, (int, float)):
            raise ValueError('Bet must be a number')
        if v < MIN_BET:
            raise ValueError(f'Bet must be at least ${MIN_BET}')
        if v > MAX_BET:
            raise ValueError(f'Bet cannot exceed ${MAX_BET}')
        return float(v)

    @validator('multiplier')
    def validate_multiplier(cls, v):
        if not isinstance(v, (int, float)):
            raise ValueError('Multiplier must be a number')
        if v < MIN_MULTIPLIER:
            raise ValueError(f'Multiplier must be at least {MIN_MULTIPLIER}')
        if v > MAX_MULTIPLIER:
            raise ValueError(f'Multiplier cannot exceed {MAX_MULTIPLIER}')
        return float(v)

    @validator('player_choice')
    def validate_choice(cls, v):
        if v not in ["heads", "tails"]:
            raise ValueError('Player choice must be "heads" or "tails"')
        return v

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

def get_client_identifier(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def check_rate_limit(client_id: str) -> bool:
    now = time.time()
    requests = rate_limit_store[client_id]
    
    requests[:] = [req_time for req_time in requests if now - req_time < RATE_LIMIT_WINDOW]
    
    if len(requests) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    
    requests.append(now)
    return True

def get_server_seed_hash(server_seed: str) -> str:
    return hashlib.sha256(server_seed.encode()).hexdigest()

def generate_random_0_1(server_seed: str, client_seed: str, nonce: int) -> float:
    message = f"{client_seed}:{nonce}".encode()
    digest = hmac.new(server_seed.encode(), message, hashlib.sha256).hexdigest()
    first_8_bytes = digest[:16]
    as_int = int(first_8_bytes, 16)
    max_int = 16 ** 16
    return as_int / max_int

@app.post("/play", response_model=PlayResponse)
async def play(req: PlayRequest, request: Request):
    global NONCE_COUNTER
    
    try:
        client_id = get_client_identifier(request)
        
        if not check_rate_limit(client_id):
            logger.warning(f"Rate limit exceeded for client {client_id}")
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please slow down."
            )
        
        if req.bet < MIN_BET or req.bet > MAX_BET:
            logger.warning(
                f"Out-of-range bet attempt: {req.bet} from {client_id}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Bet must be between ${MIN_BET} and ${MAX_BET}"
            )
        
        if req.multiplier < MIN_MULTIPLIER or req.multiplier > MAX_MULTIPLIER:
            logger.warning(
                f"Out-of-range multiplier attempt: {req.multiplier} from {client_id}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Multiplier must be between {MIN_MULTIPLIER} and {MAX_MULTIPLIER}"
            )
        
        NONCE_COUNTER += 1
        nonce = NONCE_COUNTER
        
        win_chance = RTP / req.multiplier
        
        roll = generate_random_0_1(SERVER_SEED, req.client_seed, nonce)
        
        did_win = roll < win_chance
        coin_side = "heads" if roll < 0.5 else "tails"
        
        choice_matched = coin_side == req.player_choice
        actual_win = did_win and choice_matched
        
        payout = req.bet * req.multiplier if actual_win else 0.0
        
        server_seed_hash = get_server_seed_hash(SERVER_SEED)
        
        logger.info(
            f"Game round: client={client_id}, bet={req.bet}, mult={req.multiplier}, "
            f"win={actual_win}, nonce={nonce}"
        )
        
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
    
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {str(e)} from {get_client_identifier(request)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in /play: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred. Please try again."
        )
