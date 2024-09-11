# ChatNG - Let chat control your (sim) vehicle
ChatNG is a simple BeamNG mod + python service that lets Twitch chat control the player vehicle in BeamNG.

## Installation
1. Clone this repository into your BeamNG installation's unpacked mods folder.
2. Follow the instructions in `./twitch_bridge/README.md` to get the python service up and running
3. Start BeamNG and send yourself a message in your Twitch chat (works even if you're not currently streaming) to verify it's working

## Usage
Currently there's basic commands that can be used from chat.

- "throttle"
- "brake"
- "clutch"
- "left"
- "right"
- "parkingbrake" or "handbrake"

Anytime a message is sent in Twitch chat that consists of **only one** of those terms, that control is set to 100% for 1 second.

