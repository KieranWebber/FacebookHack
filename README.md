# Livestream Bingo

Bingo application for Livestreams developed during the 2018 Facebook London Hackathon.
Requires FFmpeg.

# Socket.io Channels
# Incoming
- "register": Incoming channel for registering a user and their bingo choices

# Outgoing
- "sync": Sync object containing information for intial connection. {time: time to start, title: stream title}
- "scores": Array of sorted user objects based on their score
- "late": Notifies if you are too late to register a user for the current game
