// components/ui/button.tsx
import * as React from "react";
import { cn } from "../../../utils"; // or class-variance-authority

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "secondary";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", ...props }, ref) => {
        const baseStyle = "inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium focus:outline-none";
        const variants: Record<string, string> = {
            default: "bg-blue-600 text-white hover:bg-blue-700",
            secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
        };
        return (
            <button
                ref={ref}
                className={cn(baseStyle, variants[variant], className)}
                {...props}
            />
        );
    }
);

Button.displayName = "Button";