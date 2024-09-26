from dotenv import load_dotenv

load_dotenv()

import os
import asyncio
from typing import List, Optional
from dataclasses import dataclass, asdict

from aiohttp import web
from twitchAPI.helper import first
from twitchAPI.twitch import Twitch
from twitchAPI.oauth import UserAuthenticationStorageHelper
from twitchAPI.object.eventsub import ChannelFollowEvent, ChannelChatMessageEvent
from twitchAPI.eventsub.websocket import EventSubWebsocket
from twitchAPI.type import AuthScope


TWITCH_OAUTH_APP_ID = os.environ.get("TWITCH_OAUTH_APP_ID")
TWITCH_OAUTH_APP_SECRET = os.environ.get("TWITCH_OAUTH_APP_SECRET")
TARGET_SCOPES = [AuthScope.MODERATOR_READ_FOLLOWERS, AuthScope.USER_READ_CHAT]


@dataclass
class ControlInput:
    name: str
    min: float
    max: float


@dataclass
class Action:
    control: str
    intensity: float
    duration: int


# Shared state object
actions: List[Action] = []


def parse_control_message(message: str) -> Optional[Action]:
    if message == "handbrake":
        message = "parkingbrake"
    if message in ["throttle", "brake", "clutch", "left", "right", "parkingbrake"]:
        return Action(
            control=message,
            intensity=1.0,
            duration=1,
        )
    return None


async def on_follow(data: ChannelFollowEvent):
    # our event happened, lets do things with the data we got!
    print(f"{data.event.user_name} now follows {data.event.broadcaster_user_name}!")


async def on_message(data: ChannelChatMessageEvent):
    message = data.event.message.text
    action = parse_control_message(message)
    if action:
        print(
            f"Got control message: {action.control} at {action.intensity * 100}% for {action.duration} seconds"
        )
        # For steering it's -1 to 1, so convert that real quick
        if action.control in ["left", "right"]:
            if action.control == "left":
                action.intensity = -1 * action.intensity
            action.control = "steering"
        print(action)
        actions.append(action)


async def twitch_event_listener():
    # create the api instance and get user auth either from storage or website
    twitch = await Twitch(TWITCH_OAUTH_APP_ID, TWITCH_OAUTH_APP_SECRET)
    helper = UserAuthenticationStorageHelper(twitch, TARGET_SCOPES)
    await helper.bind()

    # get the currently logged in user
    user = await first(twitch.get_users())

    # create eventsub websocket instance and start the client.
    eventsub = EventSubWebsocket(twitch)
    eventsub.start()
    # subscribing to the desired eventsub hook for our user
    # the given function (in this example on_follow) will be called every time this event is triggered
    # the broadcaster is a moderator in their own channel by default so specifying both as the same works in this example
    # We have to subscribe to the first topic within 10 seconds of eventsub.start() to not be disconnected.
    await eventsub.listen_channel_follow_v2(user.id, user.id, on_follow)
    await eventsub.listen_channel_chat_message(user.id, user.id, on_message)

    async def stopper():
        print("Stopping twitch event listener")
        # stopping both eventsub as well as gracefully closing the connection to the API
        await eventsub.stop()
        await twitch.close()

    return stopper


async def run_http_server():
    async def handle_get_action(request):
        print(f"GET /get-action  --  All actions: {len(actions)} - {actions}")
        if len(actions) == 0:
            return web.json_response({})
        action = asdict(actions.pop(0))
        return web.json_response(action)

    app = web.Application()
    app.router.add_get("/get-action", handle_get_action)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "localhost", 8832)
    await site.start()
    print("HTTP server started on http://localhost:8832")

    async def stopper():
        print("Stopping http server")

    return stopper


async def main():
    http_stopper = await run_http_server()
    twitch_stopper = await twitch_event_listener()
    # TODO: This doesn't work how I intended, I get a asyncio.CancelledError when I try to stop the server
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        await asyncio.gather(http_stopper(), twitch_stopper())


if __name__ == "__main__":
    asyncio.run(main())
