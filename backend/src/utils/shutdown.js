// Stops the server without cutting SOS sends in progress: no new connections, then the requests and
// sends still running finish, then exit. A send stuck past waitMs is left to the retry queue.
export const SHUTDOWN_WAIT_MS = 10000;

export const createShutdown = ({ server, socket, notify, exit = process.exit, waitMs = SHUTDOWN_WAIT_MS }) => {
  let stopping = false;

  return async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`🛑 [SHUTDOWN] ${signal}: finishing work in progress (up to ${waitMs / 1000}s)`);

    const timer = setTimeout(() => {
      console.error('⚠️ [SHUTDOWN] Work still running, exiting anyway. Queued retries will cover it.');
      exit(1);
    }, waitMs);

    try {
      socket.close();
      await new Promise((resolve) => server.close(resolve));
      await notify.stop();
      clearTimeout(timer);
      console.log('✅ [SHUTDOWN] Finished');
      exit(0);
    } catch (e) {
      clearTimeout(timer);
      console.error('⚠️ [SHUTDOWN] Failed:', e);
      exit(1);
    }
  };
};
