import { supabase } from '../config/supabase.js';

// Job queue on Supabase Queues (pgmq, exposed through the pgmq_public schema).
// The only file that knows where jobs are stored: moving to Redis (BullMQ) or Kafka later
// means rewriting these four functions, not the code that sends or handles jobs.
const pgmq = () => supabase.schema('pgmq_public');

const call = async (fn, args) => {
  const { data, error } = await pgmq().rpc(fn, args);
  if (error) {
    const err = new Error(error.message);
    err.code = error.code;
    throw err;
  }
  return data;
};

export const QueueService = {
  // Adds a job, hidden from readers for delaySeconds. Returns the job id.
  async send(queue, message, delaySeconds = 0) {
    const data = await call('send', { queue_name: queue, message, sleep_seconds: delaySeconds });
    return Array.isArray(data) ? data[0] : data;
  },

  // Takes up to n visible jobs and hides them for visibilitySeconds; a job not deleted by then
  // comes back (read_ct counts how many times it was taken)
  async read(queue, visibilitySeconds, n) {
    return (await call('read', { queue_name: queue, sleep_seconds: visibilitySeconds, n })) || [];
  },

  async delete(queue, id) {
    return call('delete', { queue_name: queue, message_id: id });
  },

  // Moves a job out of the queue into its archive table (kept for checking what failed)
  async archive(queue, id) {
    return call('archive', { queue_name: queue, message_id: id });
  },
};

export default QueueService;
