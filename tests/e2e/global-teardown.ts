import { deleteAllMessages } from './helpers/mailpit';

export default async (): Promise<void> => {
  await deleteAllMessages().catch(() => {
    // Non-fatal — mailpit may already be down during teardown.
  });
};
