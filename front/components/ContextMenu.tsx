import { ReactNode } from "react";
import {
  ContextMenu as ContextMenuPrimitive,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "./ui/context-menu";

interface MenuItem {
  label: string;
  icon?: ReactNode;
  action: () => void;
  variant?: "default" | "danger";
  separator?: boolean;
  submenu?: MenuItem[];
  disabled?: boolean;
}

interface ContextMenuProps {
  children: ReactNode;
  items: MenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const renderMenuItem = (item: MenuItem, index: number) => {
    if (item.submenu) {
      return (
        <ContextMenuSub key={index}>
          <ContextMenuSubTrigger>
            {item.icon}
            <span>{item.label}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {item.submenu.map((subItem, subIndex) =>
              renderMenuItem(subItem, subIndex)
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      );
    }

    return (
      <div key={index}>
        {item.separator && <ContextMenuSeparator />}
        <ContextMenuItem
          onClick={item.disabled ? undefined : item.action}
          variant={item.variant === "danger" ? "destructive" : "default"}
          disabled={item.disabled}
          className={item.disabled ? "opacity-50 cursor-not-allowed" : ""}
        >
          {item.icon}
          <span>{item.label}</span>
        </ContextMenuItem>
      </div>
    );
  };

  return (
    <ContextMenuPrimitive>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {items.map((item, index) => renderMenuItem(item, index))}
      </ContextMenuContent>
    </ContextMenuPrimitive>
  );
}
