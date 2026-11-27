import { createFileRoute } from '@tanstack/react-router';
import { TransferPage } from '@/features/transfer';
export const Route = createFileRoute('/transfer')({ component: TransferPage });
