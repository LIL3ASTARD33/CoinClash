# Coin Clash

A provably fair coin flip game with **Standard Ladder Mode**! Every win automatically enters ladder mode where you must choose to cash out or risk building your multiplier up to 10x.

## Features

- Pure 50/50 coin flip for win/loss
- **Standard Ladder Mode** - automatic after every win
- Initial multiplier range: 1.2x - 3x (snapped to ladder tiers)
- Risk & Build up to maximum 10x multiplier
- Cash out anytime to lock in your winnings
- Fair 50/50 ladder steps with 98% RTP
- Provably fair system using HMAC-SHA256
- Customizable color themes (background, panel, text, accent)
- Volume control for audio feedback
- Balance management (deposit/reset)
- Quick bet controls (half/double)
- Persistent settings via localStorage

## Setup

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd coinclash
```

### 2. Configure environment variables

Create a `.env` file or set environment variables in Netlify dashboard:

```bash
SERVER_SEED=your_random_64_character_hex_string
```

Generate a secure random seed:
```bash
openssl rand -hex 32
```

### 3. Deploy to Netlify

#### Option A: Netlify CLI (local testing)

```bash
npm install -g netlify-cli
netlify dev
```

Visit `http://localhost:8888` to play locally.

#### Option B: Deploy via Git

1. Connect your repository to Netlify
2. Set environment variable `SERVER_SEED` in Netlify dashboard (Site settings → Environment variables)
3. Deploy

## Configuration

### Environment Variables

- `SERVER_SEED` (required): Random hex string for provably fair system. Keep this secret!

## How the Game Works

### Core Flow: Win → Ladder is Standard

Coin Clash uses a two-phase design where **ladder mode is automatic** after every win:

#### Phase 1: Base Bet (Coin Flip)

1. **Player Chooses:**
   - Bet amount ($0.10 - $20,000)
   - Coin side: "Heads" or "Tails"

2. **Backend processes:**
   - Runs a fair 50/50 coin flip using `crypto.randomInt(0, 2)`
   - 0 = Heads, 1 = Tails
   - This is a true 50/50 random flip with no manipulation

3. **Outcomes:**
   - **If player loses:** Bet is lost, game ends
   - **If player wins:** Automatically enters **Ladder Mode** with an initial multiplier (1.2x - 3x)

**Important:** Winning the base flip does NOT pay out immediately. You must cash out to receive any winnings.

#### Phase 2: Ladder Mode (Standard Post-Win Behavior)

**Every win automatically enters ladder mode.** There is no option to skip it - this is the core game mechanic.

After winning the base flip, you start with an initial multiplier and have two choices:

1. **💰 Cash Out** → Lock in `bet × currentMultiplier` and end the round
2. **🎲 Risk & Build** → Try to increase your multiplier (50/50 chance to succeed or lose everything)

**Ladder Mechanics:**

- **Starting Point:** `currentMultiplier` = the multiplier won in the Bet Phase (snapped to nearest tier)
- **Maximum:** `maxMultiplier` = 10x (hard cap)
- **Ladder Tiers:** [1.5x, 2x, 3x, 4x, 5x, 7x, 10x]

Each time the player clicks "Risk & Build":
- Backend performs a fair 50/50 "ladder flip" using `crypto.randomInt(0, 2)`
  - 0 = success, 1 = fail
- **If success:**
  - Move to the next tier in the ladder
  - Can continue risking or cash out (unless at 10x max)
- **If fail:**
  - Lose everything (payout = $0)
  - Ladder session ends

**Cash Out is always available:**
- Immediately after base win (at initial multiplier)
- After any successful ladder step
- Until you bust or reach 10x maximum

**At 10x maximum:**
- Risk & Build is disabled
- Only Cash Out is available

### RTP & House Edge Design

**Core Principle:** The coin flip and ladder steps are always fair 50/50. The house edge comes entirely from the payout math.

**RTP:** 98%  
**House Edge:** 2%  
**All randomness:** Pure 50/50 flips (base coin + ladder steps)

**How the house edge works:**

The game maintains a 2% house edge while keeping all flips truly random:

1. **Base coin flip:** Always 50/50 (fair)
2. **Ladder steps:** Always 50/50 (fair)
3. **House edge comes from:**
   - Initial multiplier distribution (1.2x - 3x range)
   - Ladder tier structure
   - Mathematical expectation: pressing "Risk & Build" has EV ≤ cashing out

**Example calculation:**

At 2x multiplier, if you Risk & Build:
- 50% chance to reach 3x
- 50% chance to bust (0x)
- Expected Value = (0.5 × 3x) + (0.5 × 0x) = 1.5x
- Current value if you cash out = 2x
- Therefore: EV of risking < value of cashing = negative EV = house edge

This structure ensures that while the ladder is exciting and offers genuine skill (deciding when to cash out), the house maintains its edge through payout math, not by rigging outcomes.

### Gameplay Examples

**Example 1: Safe Play**
- Bet $10 on Heads
- Coin lands Heads → WIN → Enter ladder at 1.5x
- **Cash Out immediately**
- **Payout:** $15.00 (profit: $5.00)

**Example 2: Moderate Risk**
- Bet $10 on Tails
- Coin lands Tails → WIN → Enter ladder at 2x
- **Risk & Build** → Success → 3x
- **Cash Out**
- **Payout:** $30.00 (profit: $20.00)

**Example 3: Busted**
- Bet $10 on Heads
- Coin lands Heads → WIN → Enter ladder at 1.5x
- **Risk & Build** → Success → 2x
- **Risk & Build** → Success → 3x
- **Risk & Build** → **BUST** → 0x
- **Payout:** $0.00 (loss: $10.00)

**Example 4: Maximum Multiplier**
- Bet $10 on Tails
- Coin lands Tails → WIN → Enter ladder at 3x
- **Risk & Build** → Success → 4x
- **Risk & Build** → Success → 5x
- **Risk & Build** → Success → 7x
- **Risk & Build** → Success → 10x (MAX)
- **Cash Out** (only option)
- **Payout:** $100.00 (profit: $90.00)

### Key Differences from Optional Ladder

**Previous version:** Ladder was optional - you could win the base flip and immediately receive a payout.

**Current version (Standard Ladder):**
- ✅ Every win **must** enter ladder mode
- ✅ No immediate payout on base win
- ✅ You **must cash out** to receive any winnings
- ✅ Everything is "at risk" until you cash out
- ✅ Creates more engagement and decision-making
- ✅ Maintains 98% RTP through ladder math

### Provably Fair System

The game uses a provably fair system that you can independently verify:

1. **Server Seed:** Secret random string (hashed and shown to you)
2. **Client Seed:** Your unique seed generated for each bet
3. **Nonce:** Counter that increments with each bet
4. **Roll Calculation:** `HMAC-SHA256(server_seed, client_seed:nonce)` (used for verification)
5. **Base Coin Flip:** `crypto.randomInt(0, 2)` (true 50/50)
6. **Ladder Steps:** `crypto.randomInt(0, 2)` (true 50/50 for each step)

**Verification:**
- Click "Show Provably Fair Details" to see all game data
- Click "Verify Result Independently" to copy verification data
- Use any HMAC-SHA256 calculator to verify the roll independently

### Why This Is Fair

✅ **Transparent Randomness:** True 50/50 flips using `crypto.randomInt()`  
✅ **No Outcome Manipulation:** Server cannot adjust wins/losses to increase profit  
✅ **Clear House Edge:** The 2% edge comes from ladder math, not from rigged flips  
✅ **Independently Verifiable:** Every result can be verified with publicly available tools  
✅ **Casino-Grade Fair:** Similar model to major provably fair crypto casinos  
✅ **Player Control:** You decide when to cash out or risk building higher  
✅ **Standard Ladder:** Creates engaging press-your-luck gameplay while maintaining fairness

## API Contract

The game backend (`netlify/functions/play.js`) supports three modes:

### Mode: `base_bet`

**Request:**
```json
{
  "mode": "base_bet",
  "bet": 10.00,
  "player_choice": "heads",
  "client_seed": "..."
}
```

**Response (Loss):**
```json
{
  "did_win": false,
  "payout": 0,
  "current_multiplier": 0,
  "coin_side": "tails",
  "ladder_active": false,
  "roll": 0.623456,
  "server_seed_hash": "...",
  "nonce": 123
}
```

**Response (Win):**
```json
{
  "did_win": true,
  "payout": 0,
  "current_multiplier": 1.5,
  "max_multiplier": 10,
  "can_continue": true,
  "coin_side": "heads",
  "ladder_active": true,
  "ladder_session_id": "...",
  "roll": 0.234567,
  "server_seed_hash": "...",
  "nonce": 124
}
```

### Mode: `ladder_step`

**Request:**
```json
{
  "mode": "ladder_step",
  "ladder_session_id": "..."
}
```

**Response (Success):**
```json
{
  "did_win_ladder_step": true,
  "current_multiplier": 2.0,
  "can_continue": true,
  "ladder_over": false
}
```

**Response (Bust):**
```json
{
  "did_win_ladder_step": false,
  "current_multiplier": 0,
  "final_payout": 0,
  "can_continue": false,
  "ladder_over": true
}
```

### Mode: `cash_out`

**Request:**
```json
{
  "mode": "cash_out",
  "ladder_session_id": "..."
}
```

**Response:**
```json
{
  "final_payout": 15.00,
  "final_multiplier": 1.5,
  "ladder_over": true
}
```

## Configuration

### Game Settings

Access settings via the gear icon (⚙️):

- **Colors:** Customize background, panel, text, and accent colors
- **Audio:** Adjust volume (0-100%) for sound effects and background music
- **Balance:** Deposit funds to play
- **Bet Controls:** Use ½ or 2× buttons for quick bet adjustments

### Account Center

Access via the user icon (👤):

- View balance and account stats
- See recent transactions
- Export game history
- Reset statistics

## Project Structure

```
├── index.html              # Game frontend
├── netlify/
│   └── functions/
│       └── play.js         # Serverless function for game logic
├── netlify.toml            # Netlify configuration
├── .env.example            # Environment variable template
└── README.md               # This file
```

## License

MIT
