import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.ComponentProps<"div"> {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-2", className)}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
