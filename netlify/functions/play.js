const crypto = require('crypto');

const HOUSE_EDGE = 0.03;
const SERVER_SEED = "super_secret_server_seed_change_me";
let NONCE_COUNTER = 0;

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

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const req = JSON.parse(event.body);
    
    NONCE_COUNTER += 1;
    const nonce = NONCE_COUNTER;

    if (!req.bet || req.bet < 0.1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Minimum bet is $0.10' })
      };
    }

    if (req.bet > 20000) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Maximum bet is $20,000' })
      };
    }

    if (!req.multiplier || req.multiplier <= 1.0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Multiplier must be greater than 1.0.' })
      };
    }

    const roll = generateRandom01(SERVER_SEED, req.client_seed, nonce);
    const coinSide = roll < 0.5 ? "heads" : "tails";
    
    const playerChoice = req.player_choice || "heads";
    const didWin = coinSide === playerChoice;
    const payout = didWin ? req.bet * req.multiplier : 0.0;
    
    const winChance = 0.5;
    
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
        payout: payout,
        roll: roll,
        win_chance: winChance,
        server_seed_hash: serverSeedHash,
        nonce: nonce,
        coin_side: coinSide
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
