import type { LucideIcon } from "lucide-react";

interface PageShellProps {
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
}

export function PageShell({ title, description, icon: Icon, emptyTitle, emptyText }: PageShellProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold">{emptyTitle}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyText}</p>
      </div>
    </div>
  );
}

