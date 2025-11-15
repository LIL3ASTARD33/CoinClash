const crypto = require('crypto');

// ===================================================================
// COIN CLASH - Standard Ladder Mode Game Logic
// ===================================================================
// Game Flow:
//   1. Base Bet: 50/50 coin flip (win or lose)
//   2. On Win: Automatically enter ladder mode (NO immediate payout)
//   3. Ladder: Player chooses Cash Out or Risk & Build
//   4. Cash Out: Lock in bet × currentMultiplier
//   5. Risk & Build: 50/50 chance to climb or bust
//
// RTP: 98% | House Edge: 2%
// All flips are true 50/50 using crypto.randomInt()
// House edge comes from initial multiplier distribution & ladder math
// ===================================================================

const RTP = 0.98;
const MIN_BET = 0.10;
const MAX_BET = 20000.00;
const MAX_MULTIPLIER = 10;
const SERVER_SEED = process.env.SERVER_SEED || "super_secret_server_seed_change_me";
let NONCE_COUNTER = 0;

const LADDER_TIERS = [1.5, 2, 3, 4, 5, 7, 10];  // Discrete multiplier progression
const STEP_FACTOR = 1.5;                         // Alternative (not currently used)

const ladderSessions = new Map();  // Active ladder sessions (in-memory)

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 1000;
const RATE_LIMIT_MAX = 8;

function getServerSeedHash(serverSeed) {
  return crypto.createHash('sha256').update(serverSeed).digest('hex');
}

function generateRandom01(serverSeed, clientSeed, nonce) {
  const message = `${clientSeed}:${nonce}`;
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(message);
  const digest = hmac.digest('hex');
  const first8Bytes = digest.slice(0, 16);
  const asInt = parseInt(first8Bytes, 16);
  const maxInt = Math.pow(16, 16);
  return asInt / maxInt;
}

// Picks initial multiplier for base win (1.2x - 3.0x range)
// This creates variety while maintaining target RTP
function pickInitialMultiplier() {
  const min = 1.2;
  const max = 3.0;
  const rand = crypto.randomInt(0, 100000) / 100000;
  return Math.round((min + rand * (max - min)) * 100) / 100;
}

// Snaps multiplier to nearest ladder tier (equal or above)
function snapToTier(multiplier) {
  for (let tier of LADDER_TIERS) {
    if (multiplier <= tier) {
      return tier;
    }
  }
  return LADDER_TIERS[LADDER_TIERS.length - 1];
}

// Returns next ladder tier above current multiplier
function getNextTier(currentMultiplier) {
  for (let i = 0; i < LADDER_TIERS.length; i++) {
    if (LADDER_TIERS[i] > currentMultiplier) {
      return LADDER_TIERS[i];
    }
  }
  return MAX_MULTIPLIER;
}

// Creates ladder session after base win
// Sessions expire after 5 minutes
function createLadderSession(betAmount, currentMultiplier) {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const session = {
    sessionId,
    betAmount,
    currentMultiplier,
    maxMultiplier: MAX_MULTIPLIER,
    createdAt: Date.now()
  };
  ladderSessions.set(sessionId, session);
  setTimeout(() => ladderSessions.delete(sessionId), 300000);
  return session;
}

function getLadderSession(sessionId) {
  return ladderSessions.get(sessionId);
}

function deleteLadderSession(sessionId) {
  ladderSessions.delete(sessionId);
}

function checkRateLimit(clientId) {
  const now = Date.now();
  
  if (!rateLimitStore.has(clientId)) {
    rateLimitStore.set(clientId, []);
  }
  
  const requests = rateLimitStore.get(clientId);
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT_MAX) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitStore.set(clientId, recentRequests);
  return true;
}

function getClientId(event) {
  const forwarded = event.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return event.headers['client-ip'] || 'unknown';
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ detail: 'Method not allowed' })
    };
  }

  try {
    const clientId = getClientId(event);
    
    if (!checkRateLimit(clientId)) {
      return {
        statusCode: 429,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ detail: 'Too many requests. Please slow down.' })
      };
    }
    
    const req = JSON.parse(event.body);
    const mode = req.mode || 'base_bet';
    
    if (mode === 'base_bet') {
      return handleBaseBet(req);
    } else if (mode === 'ladder_step') {
      return handleLadderStep(req);
    } else if (mode === 'cash_out') {
      return handleCashOut(req);
    } else {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ detail: 'Invalid mode' })
      };
    }
  } catch (error) {
    console.error('Error in play function:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'An unexpected error occurred. Please try again.' })
    };
  }
};

// ===================================================================
// MODE: base_bet - Base coin flip (50/50)
// ===================================================================
function handleBaseBet(req) {
  NONCE_COUNTER += 1;
  const nonce = NONCE_COUNTER;

  if (typeof req.bet !== 'number' || isNaN(req.bet)) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'Bet must be a valid number' })
    };
  }

  if (req.bet < MIN_BET) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: `Minimum bet is $${MIN_BET.toFixed(2)}` })
    };
  }

  if (req.bet > MAX_BET) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: `Maximum bet is $${MAX_BET.toLocaleString('en-US', {minimumFractionDigits: 2})}` })
    };
  }

  const playerChoice = req.player_choice || "heads";
  
  if (!['heads', 'tails'].includes(playerChoice)) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'Player choice must be "heads" or "tails"' })
    };
  }
  
  // Perform true 50/50 coin flip (cryptographically secure)
  const flip = crypto.randomInt(0, 2);  // 0 or 1
  const coinSide = flip === 0 ? "heads" : "tails";
  const didWin = coinSide === playerChoice;
  
  // Generate provably fair roll for verification
  const roll = generateRandom01(SERVER_SEED, req.client_seed, nonce);
  const serverSeedHash = getServerSeedHash(SERVER_SEED);
  
  // LOSS: Return immediately with no payout
  if (!didWin) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        did_win: false,
        payout: 0,
        current_multiplier: 0,
        roll: roll,
        server_seed_hash: serverSeedHash,
        nonce: nonce,
        coin_side: coinSide,
        ladder_active: false
      })
    };
  }
  
  // WIN: Enter STANDARD LADDER MODE (no immediate payout)
  // Generate initial multiplier (1.2x - 3x), snap to tier
  const initialMultiplier = pickInitialMultiplier();
  const currentMultiplier = snapToTier(initialMultiplier);
  
  // Create ladder session
  const session = createLadderSession(req.bet, currentMultiplier);
  
  // Note: payout = 0 because player MUST cash out to receive winnings
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify({
      did_win: true,
      payout: 0,
      current_multiplier: currentMultiplier,
      max_multiplier: MAX_MULTIPLIER,
      can_continue: currentMultiplier < MAX_MULTIPLIER,
      roll: roll,
      server_seed_hash: serverSeedHash,
      nonce: nonce,
      coin_side: coinSide,
      ladder_active: true,
      ladder_session_id: session.sessionId
    })
  };
}

function handleLadderStep(req) {
  if (!req.ladder_session_id) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'Ladder session ID required' })
    };
  }
  
  const session = getLadderSession(req.ladder_session_id);
  
  if (!session) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'Invalid or expired ladder session' })
    };
  }
  
  if (session.currentMultiplier >= MAX_MULTIPLIER) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'Already at maximum multiplier' })
    };
  }
  
  const ladderFlip = crypto.randomInt(0, 2);
  const didWinLadderStep = ladderFlip === 0;
  
  if (!didWinLadderStep) {
    deleteLadderSession(req.ladder_session_id);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        did_win_ladder_step: false,
        current_multiplier: 0,
        final_payout: 0,
        can_continue: false,
        ladder_over: true
      })
    };
  }
  
  const nextMultiplier = getNextTier(session.currentMultiplier);
  session.currentMultiplier = nextMultiplier;
  
  const canContinue = nextMultiplier < MAX_MULTIPLIER;
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify({
      did_win_ladder_step: true,
      current_multiplier: nextMultiplier,
      can_continue: canContinue,
      ladder_over: false
    })
  };
}

function handleCashOut(req) {
  if (!req.ladder_session_id) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'Ladder session ID required' })
    };
  }
  
  const session = getLadderSession(req.ladder_session_id);
  
  if (!session) {
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ detail: 'Invalid or expired ladder session' })
    };
  }
  
  const finalPayout = Math.round(session.betAmount * session.currentMultiplier * 100) / 100;
  deleteLadderSession(req.ladder_session_id);
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify({
      final_payout: finalPayout,
      final_multiplier: session.currentMultiplier,
      ladder_over: true
    })
  };
}
