import { createFileRoute } from '@tanstack/react-router';
import { ScanPage } from '@/features/scan';
export const Route = createFileRoute('/scan')({ component: ScanPage });
