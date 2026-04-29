import * as React from "react";

import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "resize-none placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-xl border px-3 py-2 text-base transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm shadow-sm",
        "bg-white/40 backdrop-blur-md border-slate-200/60 hover:bg-white/60 dark:bg-slate-950/40 dark:border-slate-800/60 dark:hover:bg-slate-950/60",
        "focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
