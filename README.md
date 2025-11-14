# Coin Clash

A provably fair coin flip game with customizable settings built with Netlify Functions.

## Features

- 50/50 coin flip with random multipliers (1.9x - 10,000x)
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

### Game Settings

Access settings via the gear icon (⚙️):

- **Colors**: Customize background, panel, text, and accent colors
- **Audio**: Adjust volume (0-100%)
- **Balance**: Deposit funds or reset to $1,000
- **Bet Controls**: Use ½ or 2× buttons for quick bet adjustments

## How It Works

The game uses a provably fair system:
1. Server generates outcome using `HMAC-SHA256(server_seed, client_seed:nonce)`
2. Coin flip result is deterministic based on seeds
3. Players can verify fairness using the provided hash, client seed, and nonce

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
