// pm2 settings for the live server. kill_timeout gives src/utils/shutdown.js time to finish SOS
// sends: it must stay longer than SHUTDOWN_WAIT_MS (10 seconds).
module.exports = {
  apps: [
    {
      name: 'devi-backend',
      script: 'src/server.js',
      cwd: __dirname,
      kill_timeout: 12000,
    },
  ],
};
