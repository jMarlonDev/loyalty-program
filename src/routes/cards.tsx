import { createFileRoute } from '@tanstack/react-router';
import { CustomerCardsPage } from '@/features/customer';
export const Route = createFileRoute('/cards')({
  component: CustomerCardsPage,
});
