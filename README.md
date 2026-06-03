# Who's Impostor? Telegram Bot

Who's Impostor? is a Telegram group party game. Players join a lobby, the bot sends each player a secret word in private chat, and everyone submits a private clue without saying the exact word. The bot later reveals all clues in the group for voting. Most players share one word, while one or two impostors receive a related different word.

After clues are submitted, players vote in rounds. Normal players win if all impostors are voted out. Impostors win when they reach parity with normal players, such as a final 1v1.

## Requirements

- Bun
- MongoDB
- A Telegram bot token from BotFather
- Sharp native dependencies supported by your deployment OS

## Installation

```bash
bun install
bun start
```

Bun creates the lockfile after `bun install`. Current Bun versions create `bun.lock`; older Bun versions may create `bun.lockb`. Do not write lockfile content manually.

For development:

```bash
bun run dev
```

## MongoDB Setup

Run MongoDB locally or use a hosted MongoDB URI. For a local default setup, use:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/telegram_impostor_bot
```

If the bot cannot connect, confirm MongoDB is running and that the URI in `.env` is reachable from the machine running Bun.

## BotFather Setup

1. Open Telegram and message `@BotFather`.
2. Run `/newbot`.
3. Copy the token into `.env` as `BOT_TOKEN`.
4. Add the bot to your group.
5. For the best command experience, consider disabling privacy mode with BotFather using `/setprivacy`, or ensure players use bot commands directly.

## Environment Setup

Create `.env` from `.env.example`:

```env
BOT_TOKEN=your_telegram_bot_token_here
MONGODB_URI=mongodb://127.0.0.1:27017/telegram_impostor_bot
```

Never commit your real bot token.

## Commands

- `/start` - In private chat, marks the player as DM-ready. In groups, explains the game.
- `/newgame` - Creates a lobby in a group.
- `/join` - Joins the active lobby.
- `/leave` - Leaves the active lobby.
- `/startgame` - Starts the game. Only the creator or a group admin can use it.
- `/cancelgame` - Cancels the active game. Only the creator or a group admin can use it.
- `/killgame` - Admin-only emergency cancel.
- `/describe your clue here` - Submits a clue by private DM during the describing phase.
- Send plain text in DM during the describing phase to submit a clue without `/describe`.
- `/history` - Privately shows all submitted clues from your latest game, paginated by round.
- `/vote` - Votes during the voting phase via inline buttons or by typing a name.
- `/power` - In private chat, uses your killer mode power card.
- `/status` - Shows the current lobby or game state.
- `/stats` - Shows your player stats. Reply to a user with `/stats` to view their stats.
- `/nextgame` - Subscribes you to be notified when the next lobby opens in this group.
- `/settings` - Shows group settings.
- `/set key value` - Changes a setting. Admin-only.
- `/extendtime seconds` - Extends the active lobby, clue, or vote timer. Creator or admin only. `/extend seconds` also works.
- `/endgame` - Force ends the game, reveals words and impostors. Creator or admin only.

Supported settings:

- `clueTimeLimit`
- `voteTimeLimit`
- `lobbyTimeLimit`
- `allowClueEdit`
- `maxPlayers`
- `minPlayers`
- `language`

## Example Gameplay

1. A player runs `/newgame` in a Telegram group.
2. Others press `Join Game` or run `/join`.
3. The creator presses `Start Game` or runs `/startgame`.
4. The bot checks that every player has opened a private chat with it.
5. Each player receives a secret word by DM.
   - In killer mode, two random players also receive one power card each: Detective, Silencer, Double Vote, Shield, or Saboteur.
6. Players run `/describe clue text` in private chat with the bot.
7. The bot renders the clues as message-style image pages using player profile photos when available, then starts voting after all clues arrive or after the clue timer expires.
8. Players vote with inline buttons.
9. The bot reveals the eliminated player for the round. If neither side has won, surviving players submit new DM clues for the next round.
10. When a side wins, the bot reveals the words, impostors, vote totals, and winner.

## Killer Mode Power Cards

Power cards are only assigned in games created with `/killer`. Two random players receive one random power card each and can use it once per game with `/power` in DM.

- `Detective` - During the clue phase, privately checks whether one player is an impostor.
- `Silencer` - During the clue phase, blocks one player from submitting a clue this round.
- `Double Vote` - During voting, makes your vote count as 2 this round.
- `Shield` - During voting, protects you from being ejected this round.
- `Saboteur` - During the clue phase, swaps the displayed clues of two players before voting.

## DM Troubleshooting

Telegram bots cannot message users first. Every player must open a private chat with the bot and send `/start` before the game can begin. If DM checks fail, the group will see which players need to do this.

## MongoDB Troubleshooting

If startup fails with a MongoDB connection error:

- Check that MongoDB is running.
- Check that `MONGODB_URI` is correct.
- Confirm firewall rules allow the connection if using a remote database.
- Confirm your database user has permission to read and write.

## Deploying on a VPS with Bun

1. Install Bun on the VPS.
2. Install and start MongoDB, or prepare a hosted MongoDB URI.
3. Copy the project to the server.
4. Create `.env`.
5. Run:

```bash
bun install
bun start
```

Use your preferred process manager to keep the bot running in production. Make sure only the server process can read `.env`.

## Notes

- The bot stores groups, games, players, clues, votes, and settings in MongoDB.
- Active games remain readable after bot restarts.
- Timers are temporary process helpers; deadlines are stored in MongoDB and scanned after restart.
- Telegram inline callback data uses short game codes instead of MongoDB ObjectIds.
