# Twitch Bridge

A python service that listens to Twitch events and queues up actions to be taken by the in-game mod. This service opens a bare bones HTTP server so that the lua mod in-game can easily ping the http endpoint for actions. When an action is returned, it's removed from the pending actions list. When a twitch event is seen an action is added to the pending actions list.

To be honest this could have all been done in-mod, but I'm much better with Python than Lua game code, so I made the mod as simple as possible and moved all complexity into this python service.

## Usage

1. Make sure you have the BeamNG Mod installed as this service is useless without the companion mod.
2. pip install requirements.txt.
3. Set up an application with Twitch and get your APP_ID and APP_SECRET.
4. Copy `.env.example` to `.env` and fill in your id and secret.
5. Start main.py.
