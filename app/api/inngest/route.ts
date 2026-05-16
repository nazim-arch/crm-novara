import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { generateLeadsFunction } from '@/lib/inngest/functions';
import { taskRecurrenceFunction } from '@/lib/inngest/task-recurrence';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateLeadsFunction, taskRecurrenceFunction],
});
