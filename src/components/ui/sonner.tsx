import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-center"
      duration={3500}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:animate-toast-in",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:text-xs",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          success:
            "group-[.toaster]:border-trade-green/40 group-[.toaster]:bg-trade-green/5",
          error:
            "group-[.toaster]:border-trade-red/40 group-[.toaster]:bg-trade-red/5",
          info:
            "group-[.toaster]:border-trade-blue/40 group-[.toaster]:bg-trade-blue/5",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
