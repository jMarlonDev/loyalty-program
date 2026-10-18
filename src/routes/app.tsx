import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/features/workspace';
export const Route = createFileRoute('/app')({ component: WorkspacePage });
