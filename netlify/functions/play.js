const crypto = require('crypto');

const RTP = 0.98;
const MIN_BET = 0.10;
const MAX_BET = 20000.00;
const MIN_MULTIPLIER = 1.96;
const MAX_MULTIPLIER = 10.00;
const SERVER_SEED = process.env.SERVER_SEED || "super_secret_server_seed_change_me";
let NONCE_COUNTER = 0;

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 2000;
const RATE_LIMIT_MAX = 5;

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

    if (typeof req.multiplier !== 'number' || isNaN(req.multiplier)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ detail: 'Multiplier must be a valid number' })
      };
    }

    if (req.multiplier < MIN_MULTIPLIER) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ detail: `Multiplier must be at least ${MIN_MULTIPLIER}x` })
      };
    }

    if (req.multiplier > MAX_MULTIPLIER) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ detail: `Multiplier cannot exceed ${MAX_MULTIPLIER}x` })
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
    
    const winChance = RTP / req.multiplier;
    const roll = generateRandom01(SERVER_SEED, req.client_seed, nonce);
    const coinSide = roll < 0.5 ? "heads" : "tails";
    
    const rollWon = roll < winChance;
    const choiceMatched = coinSide === playerChoice;
    const didWin = rollWon && choiceMatched;
    const payout = didWin ? req.bet * req.multiplier : 0.0;
    
    const serverSeedHash = getServerSeedHash(SERVER_SEED);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        did_win: didWin,
        roll_won: rollWon,
        choice_matched: choiceMatched,
        payout: Math.round(payout * 100) / 100,
        roll: roll,
        win_chance: winChance,
        server_seed_hash: serverSeedHash,
        nonce: nonce,
        coin_side: coinSide
      })
    };
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
