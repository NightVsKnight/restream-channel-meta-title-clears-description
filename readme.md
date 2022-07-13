
NOTE: Only tested on Windows!

To test:
1. Create a restream account and connect a YouTube and Twitch channel.
2. Create an app for that account at https://developers.restream.io/apps.
3. Use the web UI https://app.restream.io/channels/embed to set the title and description for all channels.
4. Edit index.js and set config { clientId and clientSecret } to match your app's data.
5. Run the script: `node .\index.js`.
6. Note output title and description.
7. Edit index.js and comment out the next to last command and uncomment in the last command.
8. Run the script: `node .\index.js`.
9. Note output title and unexpectedly blank/empty description.
10. Note that the web UI shows the new title but unexpectedly blank/empty description.
11. Note that using the web UI "Update Titles" button shows the old title and old non-blank/empty description.
