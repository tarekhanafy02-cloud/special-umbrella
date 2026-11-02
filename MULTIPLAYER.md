# Multiplayer

Start the relay server, then serve the game as usual:

    npm install
    npm run server          # ws://localhost:8081
    npm run dev             # http://localhost:8080  (Node 17+: NODE_OPTIONS=--openssl-legacy-provider npm run dev)

Open the game in two browser windows and you will see each other.

- Other players are drawn as tinted, name-tagged copies of the character, with synced position, rotation and animation. Players inside vehicles are shown too.
- They are visual only (no collisions, no effect on your physics/vehicles), so existing gameplay is unchanged.
- To use a different server: `?server=wss://your-host` in the page URL, or set `window.SKETCHBOOK_SERVER` before creating the World.
- If no server is running the game works exactly as before.
