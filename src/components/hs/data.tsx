import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "./primitives";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-2 py-1.5 font-medium", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={() => onRowClick?.(r)}
              className={cn(
                "border-b border-border/60 hover:bg-accent/60",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-2 py-1.5", c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  actions,
  children,
  height = 220,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  height?: number;
  className?: string | undefined;
}) {
  return (
    <Panel title={title} actions={actions} className={className}>
      <div style={{ height }}>{children}</div>
    </Panel>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: string[];
  value?: string;
  onChange?: (t: string) => void;
}) {
  const [internal, setInternal] = useState(tabs[0]);
  const active = value ?? internal;
  return (
    <div className="flex gap-0.5 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => {
            setInternal(t);
            onChange?.(t);
          }}
          className={cn(
            "-mb-px border-b-2 px-3 py-1.5 text-[12px] font-medium transition-colors",
            t === active
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] border-border bg-panel sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="font-display tracking-wide">{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-panel">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export { X };
