import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/utils";

interface WesternButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  isLoading?: boolean;
}

export const WesternButton = forwardRef<HTMLButtonElement, WesternButtonProps>(
  ({ className, variant = "primary", isLoading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "western-btn relative overflow-hidden",
          variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
          variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/90",
          variant === "danger" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          variant === "ghost" && "bg-transparent shadow-none border-transparent hover:bg-accent/10 hover:shadow-none hover:translate-y-0",
          className
        )}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-inherit">
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <span className={cn("flex items-center gap-2", isLoading && "opacity-0")}>
          {children}
        </span>
      </button>
    );
  }
);

WesternButton.displayName = "WesternButton";
